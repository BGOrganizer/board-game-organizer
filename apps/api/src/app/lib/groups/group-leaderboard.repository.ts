import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

interface LeaderboardRow {
  _id: string;
  gamesPlayed: number;
  gamesWon: number;
  nd: number;
  rating?: { conservativeScore: number; gamesPlayed: number };
}

export class GroupLeaderboardRepository {
  constructor(private db: Db) {}

  async games(groupId: string) {
    // ponytail: load all distinct titles for the Select; paginate options if groups exceed 100 games.
    const ids = (await this.db.collection(COLLECTIONS.MATCHES).distinct("selectedGameId", {
      groupId,
      status: "TERMINATED",
    })) as number[];
    if (!ids.length) return [];
    const catalog = await this.db
      .collection<{ id: number; name: string; image?: string }>(COLLECTIONS.BOARD_GAMES)
      .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, name: 1, image: 1 } })
      .toArray();
    const byId = new Map(catalog.map((game) => [game.id, game]));
    return ids
      .map((id) => ({
        id,
        name: byId.get(id)?.name ?? String(id),
        imageUrl: byId.get(id)?.image ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  }

  async players(groupId: string, gameId: number, offset: number, limit: number) {
    const rows = await this.db
      .collection(COLLECTIONS.MATCHES)
      .aggregate<LeaderboardRow>([
        { $match: { groupId, status: "TERMINATED", selectedGameId: gameId } },
        { $unwind: "$results.entries" },
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
        {
          $lookup: {
            from: COLLECTIONS.PLAYER_RATINGS,
            localField: "_id",
            foreignField: "userId",
            pipeline: [{ $match: { groupId, gameId, scope: "GROUP" } }],
            as: "ratings",
          },
        },
        { $set: { rating: { $first: "$ratings" } } },
        { $sort: { "rating.conservativeScore": -1, _id: 1 } },
        { $skip: offset },
        { $limit: limit + 1 },
        { $project: { ratings: 0 } },
      ])
      .toArray();
    return { rows: rows.slice(0, limit), nextCursor: rows.length > limit ? offset + limit : null };
  }
}
