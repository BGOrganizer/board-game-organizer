import type { Document } from "mongodb";
import { COLLECTIONS } from "../db";
/** Only rated physical tables with at least two registered finishers count. */
export function ratedTableStages(groupId: string | null, gameId?: number): Document[] {
  return [
    {
      $match: {
        "confirmed.gameId": gameId ?? { $exists: true },
        rankingEnabled: true,
        results: { $exists: true },
        removedAt: { $exists: false },
      },
    },
    {
      $set: {
        "results.entries": {
          $filter: {
            input: "$results.entries",
            as: "entry",
            cond: {
              $not: [
                {
                  $in: [
                    "$$entry.userId",
                    { $ifNull: ["$confirmed.guestPlayers.participantId", []] },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $set: {
        registeredFinishers: {
          $filter: {
            input: "$results.entries",
            as: "entry",
            cond: { $ne: ["$$entry.score", null] },
          },
        },
      },
    },
    { $match: { $expr: { $gte: [{ $size: "$registeredFinishers" }, 2] } } },
    {
      $lookup: {
        from: COLLECTIONS.EVENTS,
        let: { event: "$eventId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$id", "$$event"] },
              status: "TERMINATED",
              ...(groupId ? { groupId } : {}),
            },
          },
          { $project: { _id: 0, id: 1 } },
        ],
        as: "completedEvent",
      },
    },
    { $match: { "completedEvent.0": { $exists: true } } },
  ];
}

export function tableStatisticsStages(
  gameId: number,
  groupId: string | null,
  userIds?: readonly string[],
): Document[] {
  return [
    ...ratedTableStages(groupId, gameId),
    { $set: { winningRegisteredRank: { $min: "$registeredFinishers.rank" } } },
    { $unwind: "$results.entries" },
    ...(userIds ? [{ $match: { "results.entries.userId": { $in: userIds } } }] : []),
    {
      $group: {
        _id: "$results.entries.userId",
        gamesPlayed: { $sum: 1 },
        gamesWon: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$results.entries.rank", "$winningRegisteredRank"] },
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
  ];
}
