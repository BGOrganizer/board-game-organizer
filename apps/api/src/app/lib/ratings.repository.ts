import type {
  Match,
  MatchResults,
  PlayerRating,
  RatingEvent,
  RatingScope,
  RatingState,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";
import {
  calculateMatchRatings,
  conservativeScore,
  initialGroupRating,
  RATING_ALGORITHM,
} from "@/app/lib/rating.engine";

export class RatingsRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get ratings() {
    return this.db.collection<PlayerRating>(COLLECTIONS.PLAYER_RATINGS);
  }
  private get events() {
    return this.db.collection<RatingEvent>(COLLECTIONS.RATING_EVENTS);
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
    const gameId = match.selectedGameId;
    const userIds = results.entries.map((entry) => entry.userId);
    // Read both scopes before any write: first group result inherits PRE-match global state.
    const global = await this.snapshots(userIds, gameId, "GLOBAL", null);
    const group = match.groupId
      ? await this.snapshots(userIds, gameId, "GROUP", match.groupId)
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
      ["GROUP", match.groupId ?? null, groupAfter],
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
            matchId: match.id,
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

  async leaderboard(gameId: number, scope: RatingScope, groupId: string | null, limit = 50) {
    if ((scope === "GLOBAL") !== (groupId === null)) throw new Error("Invalid leaderboard scope");
    const rows = await this.ratings
      .find({ gameId, scope, groupId }, { projection: { _id: 0 }, ...this.opts })
      .sort({ conservativeScore: -1, userId: 1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .toArray();
    return rows.map((row) => ({ ...row, provisional: row.gamesPlayed < 5 }));
  }
}
