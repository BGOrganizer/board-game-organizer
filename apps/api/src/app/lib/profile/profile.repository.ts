import type {
  ProfilePlayerStats,
  ProfileRatingGame,
  ProfileRatingHistory,
  ProfileRatingPoint,
  ProfileView,
  RatingState,
  User,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "../db";
import { conservativeScore, displayRating } from "../ratings/rating.engine";
import { profileOutcomeStages } from "./profile-statistics";

export class ProfileRepository {
  private opts;
  constructor(
    private db: Db,
    session?: ClientSession,
  ) {
    this.opts = session ? { session } : {};
  }
  user(userId: string) {
    return this.db.collection<User>(COLLECTIONS.USERS).findOne({ clerkId: userId }, this.opts);
  }
  async player(userId: string, gameId?: number): Promise<ProfilePlayerStats> {
    const [row] = await this.db
      .collection(COLLECTIONS.EVENT_TABLES)
      .aggregate<{ gamesPlayed: number; gamesWon: number }>(
        profileOutcomeStages(userId, gameId),
        this.opts,
      )
      .toArray();
    const gamesPlayed = row?.gamesPlayed ?? 0,
      gamesWon = row?.gamesWon ?? 0;
    return { gamesPlayed, gamesWon, winRate: gamesPlayed ? (gamesWon / gamesPlayed) * 100 : null };
  }
  async groupCounts(userId: string) {
    const rows = await this.db
      .collection(COLLECTIONS.GROUPS)
      .aggregate(
        [
          { $match: { type: { $in: ["PRIVATE", "PUBLIC"] } } },
          {
            $lookup: {
              from: COLLECTIONS.GROUP_MEMBERSHIPS,
              localField: "id",
              foreignField: "groupId",
              pipeline: [{ $match: { userId, status: "ACCEPTED" } }, { $limit: 1 }],
              as: "membership",
            },
          },
          { $match: { $or: [{ adminUserId: userId }, { "membership.0": { $exists: true } }] } },
          {
            $lookup: {
              from: COLLECTIONS.GROUP_BANS,
              localField: "id",
              foreignField: "groupId",
              pipeline: [
                {
                  $match: {
                    userId,
                    revokedAt: { $exists: false },
                    $or: [{ until: null }, { until: { $gt: new Date().toISOString() } }],
                  },
                },
                { $limit: 1 },
              ],
              as: "bans",
            },
          },
          { $match: { "bans.0": { $exists: false } } },
          {
            $group: {
              _id: null,
              adminGroups: { $sum: { $cond: [{ $eq: ["$adminUserId", userId] }, 1, 0] } },
              joinedGroups: { $sum: { $cond: [{ $ne: ["$adminUserId", userId] }, 1, 0] } },
            },
          },
        ],
        this.opts,
      )
      .toArray();
    return { adminGroups: rows[0]?.adminGroups ?? 0, joinedGroups: rows[0]?.joinedGroups ?? 0 };
  }
  async social(userId: string): Promise<ProfileView["social"]> {
    const blocked = await this.db
      .collection(COLLECTIONS.BLOCKS)
      .find(
        { $or: [{ fromUserId: userId }, { toUserId: userId }] },
        { ...this.opts, projection: { fromUserId: 1, toUserId: 1 } },
      )
      .toArray();
    const excluded = blocked.map((row) =>
      row.fromUserId === userId ? row.toUserId : row.fromUserId,
    );
    const followers = await this.db
      .collection(COLLECTIONS.FOLLOWS)
      .countDocuments({ toUserId: userId, fromUserId: { $nin: excluded } }, this.opts);
    const following = await this.db
      .collection(COLLECTIONS.FOLLOWS)
      .countDocuments({ fromUserId: userId, toUserId: { $nin: excluded } }, this.opts);
    const friends = await this.db
      .collection(COLLECTIONS.FRIEND_REQUESTS)
      .aggregate(
        [
          { $match: { fromUserId: userId, status: "accepted", toUserId: { $nin: excluded } } },
          {
            $lookup: {
              from: COLLECTIONS.FRIEND_REQUESTS,
              localField: "toUserId",
              foreignField: "fromUserId",
              pipeline: [{ $match: { toUserId: userId, status: "accepted" } }, { $limit: 1 }],
              as: "reverse",
            },
          },
          { $match: { "reverse.0": { $exists: true } } },
          { $group: { _id: "$toUserId" } },
          { $count: "total" },
        ],
        this.opts,
      )
      .toArray();
    return { friends: friends[0]?.total ?? 0, followers, following };
  }
  async games(userId: string, cursor: number, query: string) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rows = await this.db
      .collection(COLLECTIONS.PLAYER_RATINGS)
      .aggregate<ProfileRatingGame>(
        [
          {
            $match: {
              userId,
              scope: "GLOBAL",
              groupId: null,
              gamesPlayed: { $gt: 0 },
              gameId: { $gt: cursor },
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.BOARD_GAMES,
              localField: "gameId",
              foreignField: "id",
              as: "game",
            },
          },
          { $unwind: "$game" },
          ...(query ? [{ $match: { "game.name": { $regex: escaped, $options: "i" } } }] : []),
          { $sort: { gameId: 1 } },
          { $limit: 21 },
          {
            $project: {
              _id: 0,
              id: "$gameId",
              name: "$game.name",
              imageUrl: { $ifNull: ["$game.image", null] },
            },
          },
        ],
        this.opts,
      )
      .toArray();
    const items = rows.slice(0, 20);
    return { items, nextCursor: rows.length > 20 ? items[items.length - 1].id : null };
  }
  async history(userId: string, gameId: number, cursor?: number): Promise<ProfileRatingHistory> {
    const filter = { userId, gameId, scope: "GLOBAL", groupId: null, tableId: { $exists: true } };
    const rows = await this.db
      .collection(COLLECTIONS.RATING_EVENTS)
      .aggregate<{ ordinal: number; before: RatingState; after: RatingState }>(
        [
          { $match: filter },
          {
            $setWindowFields: {
              sortBy: { "after.gamesPlayed": 1 },
              output: { ordinal: { $documentNumber: {} } },
            },
          },
          ...(cursor ? [{ $match: { ordinal: { $lt: cursor } } }] : []),
          { $sort: { ordinal: -1 } },
          { $limit: 101 },
          { $project: { _id: 0, ordinal: 1, before: 1, after: 1 } },
        ],
        this.opts,
      )
      .toArray();
    const latest = await this.db.collection(COLLECTIONS.RATING_EVENTS).findOne(filter, {
      ...this.opts,
      sort: { "after.gamesPlayed": -1, _id: -1 },
      projection: { after: 1, before: 1 },
    });
    const snapshot = await this.db
      .collection(COLLECTIONS.PLAYER_RATINGS)
      .findOne({ userId, gameId, scope: "GLOBAL", groupId: null }, this.opts);
    const game = await this.db
      .collection(COLLECTIONS.BOARD_GAMES)
      .findOne({ id: gameId }, { ...this.opts, projection: { id: 1, name: 1, image: 1 } });
    const points: ProfileRatingPoint[] = rows
      .slice(0, 100)
      .reverse()
      .map((row) => ({
        ordinal: row.ordinal,
        rating: displayRating(row.after),
        delta: conservativeScore(row.after) - conservativeScore(row.before),
      }));
    return {
      game: game ? { id: gameId, name: game.name, imageUrl: game.image ?? null } : null,
      rating: snapshot ? displayRating(snapshot as unknown as RatingState) : null,
      delta:
        latest && snapshot && latest.after.gamesPlayed === snapshot.gamesPlayed
          ? conservativeScore(latest.after as RatingState) -
            conservativeScore(latest.before as RatingState)
          : null,
      stats: await this.player(userId, gameId),
      points,
      nextCursor: rows.length > 100 ? points[0].ordinal : null,
    };
  }
}
