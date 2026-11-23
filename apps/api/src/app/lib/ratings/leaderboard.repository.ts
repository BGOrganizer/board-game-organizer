import type {
  GroupLeaderboardResponse,
  LeaderboardQuery,
  LeaderboardSort,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db, Document } from "mongodb";
import { COLLECTIONS } from "../db";
import { publicUserName } from "../users/public-user-name";
import { ratedTableStages, tableStatisticsStages } from "./table-statistics";

type LeaderboardRow = {
  _id: string;
  gamesPlayed: number;
  gamesWon: number;
  nd: number;
  rating?: { conservativeScore: number; gamesPlayed: number };
  position: number | null;
};

type GroupLeaderboardRow = LeaderboardRow & {
  name: string;
  username: string | null;
  avatarUrl: string | null;
  left: boolean;
  groupRole: "ADMIN" | "MODERATOR" | "MEMBER" | null;
};

type GlobalLeaderboardRow = LeaderboardRow & {
  profile: {
    name?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    email?: string | null;
  };
};

export function leaderboardPlayer(
  row: GroupLeaderboardRow,
): GroupLeaderboardResponse["players"][number] {
  return {
    userId: row._id,
    name: row.name,
    username: row.username,
    avatarUrl: row.avatarUrl,
    gamesPlayed: row.gamesPlayed,
    gamesWon: row.gamesWon,
    nd: row.nd,
    rating: row.rating ? 500 + row.rating.conservativeScore : null,
    position: row.position,
    provisional: row.rating ? row.rating.gamesPlayed < 5 : false,
    left: row.left,
    groupRole: row.groupRole ?? null,
  };
}

const ratingOrder = { hasRating: -1, "rating.conservativeScore": -1, _id: 1 };
const sortField: Record<Exclude<LeaderboardSort, "rating">, string> = {
  gamesPlayed: "finishedGames",
  gamesWon: "gamesWon",
  nd: "nd",
};

function leaderboardOrderStages({
  sort = "rating",
  direction = "desc",
}: Pick<LeaderboardQuery, "sort" | "direction">): Document[] {
  const order = direction === "asc" ? 1 : -1;
  return [
    {
      $set: {
        hasRating: { $ne: [{ $ifNull: ["$rating.conservativeScore", null] }, null] },
        finishedGames: { $subtract: ["$gamesPlayed", "$nd"] },
      },
    },
    {
      $setWindowFields: {
        sortBy: ratingOrder,
        output: {
          canonicalPosition: { $sum: 1, window: { documents: ["unbounded", "current"] } },
        },
      },
    },
    { $set: { position: { $cond: ["$hasRating", "$canonicalPosition", null] } } },
    {
      $sort:
        sort === "rating"
          ? { ...ratingOrder, "rating.conservativeScore": order }
          : { [sortField[sort]]: order, canonicalPosition: 1 },
    },
  ];
}

function playerRatingStage(gameId: number, groupId: string | null): Document {
  return {
    $lookup: {
      from: COLLECTIONS.PLAYER_RATINGS,
      localField: "_id",
      foreignField: "userId",
      pipeline: [{ $match: { gameId, groupId, scope: groupId === null ? "GLOBAL" : "GROUP" } }],
      as: "ratings",
    },
  };
}

function currentPlayerStages(userIdField: string, excluded: readonly string[]): Document[] {
  return [
    { $match: { [userIdField]: { $nin: excluded } } },
    {
      $lookup: {
        from: COLLECTIONS.USERS,
        localField: userIdField,
        foreignField: "clerkId",
        pipeline: [{ $project: { _id: 0, name: 1, email: 1, username: 1, avatarUrl: 1 } }],
        as: "profile",
      },
    },
    { $unwind: "$profile" },
  ];
}

export class LeaderboardRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}
  async games(groupId: string, offset = 0, limit = 25, query?: string) {
    return this.gamePage(
      [...ratedTableStages(groupId), { $group: { _id: "$confirmed.gameId" } }],
      offset,
      limit,
      query,
    );
  }
  private async gamePage(source: Document[], offset: number, limit: number, query?: string) {
    const rows = await this.db
      .collection(COLLECTIONS.EVENT_TABLES)
      .aggregate<{ id: number; name: string; imageUrl: string | null }>(
        [
          ...source,
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
  async players(
    groupId: string,
    gameId: number,
    offset: number,
    limit: number,
    order: Pick<LeaderboardQuery, "sort" | "direction"> = {},
  ) {
    const rows = await this.db
      .collection(COLLECTIONS.EVENT_TABLES)
      .aggregate<GroupLeaderboardRow>(
        [
          ...tableStatisticsStages(gameId, groupId),
          playerRatingStage(gameId, groupId),
          { $set: { rating: { $arrayElemAt: ["$ratings", 0] } } },
          ...leaderboardOrderStages(order),
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
              groupRole: {
                $cond: [
                  { $eq: ["$_id", { $arrayElemAt: ["$group.adminUserId", 0] }] },
                  "ADMIN",
                  {
                    $cond: [
                      { $gt: [{ $size: "$members" }, 0] },
                      {
                        $cond: [
                          { $eq: [{ $arrayElemAt: ["$members.role", 0] }, "MODERATOR"] },
                          "MODERATOR",
                          "MEMBER",
                        ],
                      },
                      null,
                    ],
                  },
                ],
              },
              left: {
                $and: [
                  { $eq: [{ $size: "$members" }, 0] },
                  { $ne: ["$_id", { $arrayElemAt: ["$group.adminUserId", 0] }] },
                ],
              },
            },
          },
          {
            $project: {
              ratings: 0,
              profile: 0,
              members: 0,
              group: 0,
              finishedGames: 0,
              hasRating: 0,
              canonicalPosition: 0,
            },
          },
        ],
        { session: this.session },
      )
      .toArray();
    return { rows: rows.slice(0, limit), nextCursor: rows.length > limit ? offset + limit : null };
  }

  async global(
    page: LeaderboardQuery,
    excluded: readonly string[],
  ): Promise<GroupLeaderboardResponse> {
    const { gameId, cursor, limit, query } = page;
    if (gameId === undefined) {
      const catalog = await this.gamePage(
        [
          ...ratedTableStages(null),
          { $unwind: "$results.entries" },
          {
            $group: {
              _id: { gameId: "$confirmed.gameId", userId: "$results.entries.userId" },
            },
          },
          ...currentPlayerStages("_id.userId", excluded),
          { $group: { _id: "$_id.gameId" } },
        ],
        cursor,
        limit,
        query,
      );
      return { ...catalog, players: [] };
    }
    const rows = await this.db
      .collection(COLLECTIONS.EVENT_TABLES)
      .aggregate<GlobalLeaderboardRow>(
        [
          ...tableStatisticsStages(gameId, null),
          ...currentPlayerStages("_id", excluded),
          playerRatingStage(gameId, null),
          { $set: { rating: { $arrayElemAt: ["$ratings", 0] } } },
          ...leaderboardOrderStages(page),
          { $skip: cursor },
          { $limit: limit + 1 },
          {
            $project: {
              _id: 1,
              gamesPlayed: 1,
              gamesWon: 1,
              nd: 1,
              position: 1,
              rating: 1,
              profile: 1,
            },
          },
        ],
        { session: this.session },
      )
      .toArray();
    return {
      games: [],
      players: rows.slice(0, limit).map((row) =>
        leaderboardPlayer({
          ...row,
          name: publicUserName(row.profile, row._id),
          username: row.profile.username ?? null,
          avatarUrl: row.profile.avatarUrl ?? null,
          left: false,
          groupRole: null,
        }),
      ),
      nextCursor: rows.length > limit ? cursor + limit : null,
    };
  }
}
