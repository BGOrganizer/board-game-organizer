import type { Document } from "mongodb";
/** Database-side filtering, before paging. Unchosen dates belong to both periods. */
export function eventPeriodStages(
  periods: readonly ("past" | "future")[] | undefined,
  now: number,
  prefix = "",
): Document[] {
  if (!periods || (periods.includes("past") && periods.includes("future"))) return [];
  if (!periods.length) return [{ $match: { id: { $in: [] } } }];
  const field = (name: string) => `$${prefix}${name}`;
  const selected = {
    $let: {
      vars: {
        chosen: {
          $arrayElemAt: [
            {
              $filter: {
                input: field("dates"),
                as: "candidate",
                cond: { $eq: ["$$candidate.id", field("confirmed.dateId")] },
              },
            },
            0,
          ],
        },
      },
      in: "$$chosen.day",
    },
  };
  const day = {
    $ifNull: [
      {
        $cond: [
          { $eq: [{ $arrayElemAt: ["$parentGroup.type", 0] }, "PUBLIC"] },
          { $arrayElemAt: [field("dates.day"), 0] },
          { $cond: [{ $eq: [field("status"), "PLANNING"] }, null, selected] },
        ],
      },
      null,
    ],
  };
  const today = {
    $dateToString: { date: new Date(now), timezone: field("timeZone"), format: "%Y-%m-%d" },
  };
  return [
    {
      $match: {
        $expr: {
          $let: {
            vars: { day },
            in: {
              $or: [
                { $eq: ["$$day", null] },
                { [periods.includes("past") ? "$lt" : "$gte"]: ["$$day", today] },
              ],
            },
          },
        },
      },
    },
  ];
}
