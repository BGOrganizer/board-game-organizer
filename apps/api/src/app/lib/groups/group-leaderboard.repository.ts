import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "../db";
import { tableStatisticsStages } from "../ratings/table-statistics";
export class GroupLeaderboardRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}
  private completed(groupId: string) {
    return [
      {
        $match: {
          rankingEnabled: true,
          "confirmed.gameId": { $exists: true },
          results: { $exists: true },
          removedAt: { $exists: false },
        },
      },
      {
        $match: {
          $expr: {
            $gte: [
              {
                $size: {
                  $filter: {
                    input: "$results.entries",
                    as: "entry",
                    cond: { $ne: ["$$entry.score", null] },
                  },
                },
              },
              2,
            ],
          },
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.EVENTS,
          localField: "eventId",
          foreignField: "id",
          as: "event",
        },
      },
      { $match: { event: { $elemMatch: { groupId, status: "TERMINATED" } } } },
    ];
  }
  async games(groupId: string, offset = 0, limit = 25, query?: string) {
    const rows = await this.db
      .collection(COLLECTIONS.EVENT_TABLES)
      .aggregate<{ id: number; name: string; imageUrl: string | null }>(
        [
          ...this.completed(groupId),
          { $group: { _id: "$confirmed.gameId" } },
          {
            $lookup: {
              from: COLLECTIONS.BOARD_GAMES,
              localField: "_id",
              foreignField: "id",
              as: "game",
            },
          },
          {
            $project: {
              _id: 0,
              id: "$_id",
              name: { $ifNull: [{ $arrayElemAt: ["$game.name", 0] }, { $toString: "$_id" }] },
              imageUrl: { $ifNull: [{ $arrayElemAt: ["$game.image", 0] }, null] },
            },
          },
          ...(query
            ? [
                {
                  $match: {
                    name: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
                  },
                },
              ]
            : []),
          { $sort: { name: 1, id: 1 } },
          { $skip: offset },
          { $limit: limit + 1 },
        ],
        { session: this.session },
      )
      .toArray();
    return { games: rows.slice(0, limit), nextCursor: rows.length > limit ? offset + limit : null };
  }
  async players(groupId: string, gameId: number, offset: number, limit: number) {
    const rows = await this.db
      .collection(COLLECTIONS.EVENT_TABLES)
      .aggregate<{
        _id: string;
        gamesPlayed: number;
        gamesWon: number;
        nd: number;
        rating?: { conservativeScore: number; gamesPlayed: number };
        name: string;
        username: string | null;
        avatarUrl: string | null;
        left: boolean;
      }>(
        [
          ...tableStatisticsStages(gameId, groupId),
          {
            $lookup: {
              from: COLLECTIONS.PLAYER_RATINGS,
              localField: "_id",
              foreignField: "userId",
              pipeline: [{ $match: { gameId, groupId, scope: "GROUP" } }],
              as: "ratings",
            },
          },
          { $set: { rating: { $arrayElemAt: ["$ratings", 0] } } },
          { $sort: { "rating.conservativeScore": -1, _id: 1 } },
          { $skip: offset },
          { $limit: limit + 1 },
          {
            $lookup: {
              from: COLLECTIONS.USERS,
              localField: "_id",
              foreignField: "clerkId",
              as: "profile",
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.GROUP_MEMBERSHIPS,
              localField: "_id",
              foreignField: "userId",
              pipeline: [{ $match: { groupId, status: "ACCEPTED" } }],
              as: "members",
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.GROUPS,
              pipeline: [{ $match: { id: groupId } }],
              as: "group",
            },
          },
          {
            $set: {
              name: { $ifNull: [{ $arrayElemAt: ["$profile.name", 0] }, "$_id"] },
              username: { $ifNull: [{ $arrayElemAt: ["$profile.username", 0] }, null] },
              avatarUrl: { $ifNull: [{ $arrayElemAt: ["$profile.avatarUrl", 0] }, null] },
              left: {
                $and: [
                  { $eq: [{ $size: "$members" }, 0] },
                  { $ne: ["$_id", { $arrayElemAt: ["$group.adminUserId", 0] }] },
                ],
              },
            },
          },
          { $project: { ratings: 0, profile: 0, members: 0, group: 0 } },
        ],
        { session: this.session },
      )
      .toArray();
    return { rows: rows.slice(0, limit), nextCursor: rows.length > limit ? offset + limit : null };
  }
}
