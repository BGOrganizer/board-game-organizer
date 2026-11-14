import type {
  EventRecord,
  Match,
  MatchCurrentGameRating,
  MatchGameRating,
  MatchResults,
  PlayerRating,
  RatingEvent,
  RatingScope,
  RatingState,
  TableRatingEvent,
  TableRecord,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";
import {
  calculateMatchRatings,
  conservativeScore,
  displayRating,
  initialGroupRating,
  isProvisional,
  NEW_RATING,
  RATING_ALGORITHM,
} from "@/app/lib/ratings/rating.engine";
import { tableStatisticsStages } from "./table-statistics";

export class RatingsRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get ratings() {
    return this.db.collection<PlayerRating>(COLLECTIONS.PLAYER_RATINGS);
  }
  private get events() {
    return this.db.collection<RatingEvent | TableRatingEvent>(COLLECTIONS.RATING_EVENTS);
  }
  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  private async snapshots(
    userIds: string[],
    gameId: number,
    scope: RatingScope,
    groupId: string | null,
  ) {
    const rows = await this.ratings
      .find(
        { userId: { $in: userIds }, gameId, scope, groupId },
        { projection: { _id: 0 }, ...this.opts },
      )
      .toArray();
    return new Map<string, RatingState>(
      rows.map((row) => [
        row.userId,
        {
          mu: row.mu,
          sigma: row.sigma,
          gamesPlayed: row.gamesPlayed,
        },
      ]),
    );
  }

  /** Caller must register immutable match results in this same transaction first. */
  async applyMatch(match: Match, results: MatchResults) {
    if (!match.selectedGameId) throw new Error("Confirmed match has no selected game");
    return this.applyOutcome(
      { matchId: match.id },
      match.selectedGameId,
      match.groupId ?? null,
      results,
    );
  }
  /** Caller persists immutable table results in this same transaction. No synthetic Match. */
  async applyTableResult(event: EventRecord, table: TableRecord, results: MatchResults) {
    if (event.status !== "CONFIRMED" || !table.confirmed || table.eventId !== event.id)
      throw new Error("Confirmed event table required");
    return this.applyOutcome(
      { tableId: table.id, eventId: event.id },
      table.confirmed.gameId,
      event.groupId,
      results,
    );
  }
  private async applyOutcome(
    source: { matchId: string } | { tableId: string; eventId: string },
    gameId: number,
    scopeGroupId: string | null,
    results: MatchResults,
  ) {
    const userIds = results.entries.map((entry) => entry.userId);
    // Read both scopes before any write: first group result inherits PRE-match global state.
    const global = await this.snapshots(userIds, gameId, "GLOBAL", null);
    const group = scopeGroupId
      ? await this.snapshots(userIds, gameId, "GROUP", scopeGroupId)
      : null;
    const globalAfter = calculateMatchRatings(results.entries, global);
    const groupBefore = new Map(
      userIds.map(
        (id) =>
          [id, group?.get(id) ?? initialGroupRating(global.get(id))] satisfies [
            string,
            RatingState,
          ],
      ),
    );
    const groupAfter = group ? calculateMatchRatings(results.entries, groupBefore) : [];

    for (const [scope, groupId, rows] of [
      ["GLOBAL", null, globalAfter],
      ["GROUP", scopeGroupId, groupAfter],
    ] as const) {
      for (const row of rows) {
        const key = { userId: row.userId, gameId, scope, groupId };
        await this.ratings.updateOne(
          key,
          {
            $set: {
              ...row.after,
              conservativeScore: conservativeScore(row.after),
              updatedAt: results.finalizedAt,
            },
            $setOnInsert: key,
          },
          { ...this.opts, upsert: true },
        );
        await this.events.insertOne(
          {
            ...source,
            ...key,
            algorithm: RATING_ALGORITHM,
            rank: row.rank,
            didNotFinish: row.didNotFinish,
            before: row.before,
            after: row.after,
            delta: row.after.mu - row.before.mu,
            finalizedAt: results.finalizedAt,
          },
          this.opts,
        );
      }
    }
  }

  async currentForPlayers(
    userIds: string[],
    gameId: number,
    groupId: string | null = null,
  ): Promise<MatchCurrentGameRating[]> {
    const snapshots = await this.snapshots(userIds, gameId, groupId ? "GROUP" : "GLOBAL", groupId);
    const missing = groupId ? userIds.filter((userId) => !snapshots.has(userId)) : [];
    const global = missing.length ? await this.snapshots(missing, gameId, "GLOBAL", null) : null;
    return userIds.map((userId) => {
      const state =
        snapshots.get(userId) ?? (groupId ? initialGroupRating(global?.get(userId)) : NEW_RATING);
      return { userId, score: displayRating(state), provisional: isProvisional(state) };
    });
  }

  async matchStats(userIds: string[], gameId: number, groupId: string | null) {
    const rows = await this.db
      .collection(COLLECTIONS.MATCHES)
      .aggregate<{
        _id: string;
        gamesPlayed: number;
        gamesWon: number;
        nd: number;
      }>(
        [
          {
            $match: {
              status: "TERMINATED",
              selectedGameId: gameId,
              ...(groupId ? { groupId } : {}),
            },
          },
          { $unwind: "$results.entries" },
          { $match: { "results.entries.userId": { $in: userIds } } },
          {
            $group: {
              _id: "$results.entries.userId",
              gamesPlayed: { $sum: 1 },
              gamesWon: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$results.entries.rank", 1] },
                        { $ne: ["$results.entries.score", null] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              nd: { $sum: { $cond: [{ $eq: ["$results.entries.score", null] }, 1, 0] } },
            },
          },
        ],
        this.opts,
      )
      .toArray();
    return new Map(rows.map(({ _id, ...stats }) => [_id, stats]));
  }

  async tableStats(userIds: string[], gameId: number, groupId: string | null) {
    const rows = await this.db
      .collection(COLLECTIONS.EVENT_TABLES)
      .aggregate<{ _id: string; gamesPlayed: number; gamesWon: number; nd: number }>(
        tableStatisticsStages(gameId, groupId, userIds),
        this.opts,
      )
      .toArray();
    return new Map(rows.map(({ _id, ...stats }) => [_id, stats]));
  }
  forMatch(matchId: string, gameId: number): Promise<MatchGameRating[]> {
    return this.forOutcome({ matchId }, gameId);
  }
  forTable(
    tableId: string,
    gameId: number,
    groupId: string | null = null,
  ): Promise<MatchGameRating[]> {
    return this.forOutcome({ tableId }, gameId, groupId);
  }
  private async forOutcome(
    source: { matchId: string } | { tableId: string },
    gameId: number,
    groupId: string | null = null,
  ): Promise<MatchGameRating[]> {
    const events = await this.events
      .find(
        { ...source, gameId, scope: groupId ? "GROUP" : "GLOBAL", groupId },
        { projection: { _id: 0, userId: 1, before: 1, after: 1 }, ...this.opts },
      )
      .toArray();
    return events.map((event) => ({
      userId: event.userId,
      score: displayRating(event.after),
      delta: conservativeScore(event.after) - conservativeScore(event.before),
      provisional: isProvisional(event.after),
    }));
  }

  async leaderboard(gameId: number, scope: RatingScope, groupId: string | null, limit = 50) {
    if ((scope === "GLOBAL") !== (groupId === null)) throw new Error("Invalid leaderboard scope");
    const rows = await this.ratings
      .find({ gameId, scope, groupId }, { projection: { _id: 0 }, ...this.opts })
      .sort({ conservativeScore: -1, userId: 1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .toArray();
    return rows.map((row) => ({ ...row, provisional: isProvisional(row) }));
  }
}
