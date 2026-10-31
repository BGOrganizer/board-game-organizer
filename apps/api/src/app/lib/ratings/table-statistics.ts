import type { Document } from "mongodb";
import { COLLECTIONS } from "../db";
/** Only rated physical tables count: all-ND and fewer than two finishers change no statistics. */
export function tableStatisticsStages(
  gameId: number,
  groupId: string | null,
  userIds?: readonly string[],
): Document[] {
  return [
    {
      $match: {
        "confirmed.gameId": gameId,
        rankingEnabled: true,
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
  ];
}
