import type { Document } from "mongodb";
import { COLLECTIONS } from "../db";

/** Physical unified outcomes only; ND, excluded/removed Tables and invalid all-ND/single-finisher results never count. */
export function profileOutcomeStages(userId: string, gameId?: number): Document[] {
  // MongoDB may reorder matches; expression operands must be safe without an earlier shape guard.
  const playerIds = { $cond: [{ $isArray: "$confirmed.playerIds" }, "$confirmed.playerIds", []] };
  return [
    {
      $match: {
        removedAt: { $exists: false },
        "confirmed.playerIds": { $type: "array" },
        "results.entries.userId": userId,
        ...(gameId ? { "confirmed.gameId": gameId } : {}),
      },
    },
    {
      $lookup: {
        from: COLLECTIONS.EVENTS,
        localField: "eventId",
        foreignField: "id",
        pipeline: [{ $match: { status: "TERMINATED" } }, { $limit: 1 }],
        as: "sourceEvent",
      },
    },
    {
      $match: {
        "sourceEvent.0": { $exists: true },
        $expr: {
          $gte: [
            {
              $size: {
                $filter: {
                  input: { $cond: [{ $isArray: "$results.entries" }, "$results.entries", []] },
                  as: "entry",
                  cond: {
                    $and: [
                      { $ne: ["$$entry.score", null] },
                      { $in: ["$$entry.userId", playerIds] },
                    ],
                  },
                },
              },
            },
            2,
          ],
        },
      },
    },
    { $unwind: "$results.entries" },
    {
      $match: {
        "results.entries.userId": userId,
        "results.entries.score": { $ne: null },
        $expr: { $in: ["$results.entries.userId", playerIds] },
      },
    },
    {
      $group: {
        _id: null,
        gamesPlayed: { $sum: 1 },
        gamesWon: { $sum: { $cond: [{ $eq: ["$results.entries.rank", 1] }, 1, 0] } },
      },
    },
    { $project: { _id: 0, gamesPlayed: 1, gamesWon: 1 } },
  ];
}
