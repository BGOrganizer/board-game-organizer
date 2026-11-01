import type { Document } from "mongodb";

const tableIds = (input: string) => ({
  $reduce: {
    input,
    initialValue: [],
    in: { $setUnion: ["$$value", { $ifNull: ["$$this.tableIds", []] }] },
  },
});
export function itemFacet(id: string): { total: Document[]; effects: Document[] } {
  const effect = (kind: string, value: string, condition: unknown) => ({
    $cond: [condition, [{ kind, id: value }], []],
  });
  const complete = { $eq: [{ $size: "$_afterItems" }, 0] };
  const start: Document[] = [
    { $match: { $or: [{ "_items.id": id }, { "_items.sectionId": id }], _kind: { $ne: null } } },
    {
      $set: {
        _afterItems: {
          $filter: {
            input: "$_items",
            as: "item",
            cond: {
              $and: [
                { $ne: ["$$item.id", id] },
                { $ne: [{ $ifNull: ["$$item.sectionId", null] }, id] },
              ],
            },
          },
        },
      },
    },
    {
      $set: {
        _afterTables: { $setIntersection: [tableIds("$_afterItems"), "$_tableIds"] },
        _pulseAt: {
          $max: {
            $map: {
              input: {
                $filter: {
                  input: "$_items",
                  as: "item",
                  cond: { $or: [{ $eq: ["$$item.id", id] }, { $eq: ["$$item.sectionId", id] }] },
                },
              },
              as: "item",
              in: { $ifNull: ["$$item.changedAt", "$createdAt"] },
            },
          },
        },
      },
    },
  ];
  return {
    total: [
      ...start,
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          signal: {
            $max: {
              $concat: [
                {
                  $dateToString: {
                    date: "$_pulseAt",
                    format: "%Y-%m-%dT%H:%M:%S.%LZ",
                    timezone: "UTC",
                  },
                },
                "|",
                { $toString: "$_id" },
              ],
            },
          },
          unread: { $sum: { $cond: [complete, 1, 0] } },
          tables: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gt: [{ $size: "$_tableIds" }, 0] },
                    { $eq: [{ $size: "$_afterTables" }, 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          eventId: { $first: "$_eventId" },
          groupId: { $first: "$_groupId" },
        },
      },
    ],
    effects: [
      ...start,
      {
        $project: {
          targets: {
            $setUnion: [
              [{ kind: "item", id }],

              {
                $map: {
                  input: {
                    $setDifference: [
                      { $setDifference: ["$_items.sectionId", [null]] },
                      { $setDifference: ["$_afterItems.sectionId", [null]] },
                    ],
                  },
                  as: "id",
                  in: { kind: "item", id: "$$id" },
                },
              },
              effect("event", "$_eventId", { $and: [complete, { $ne: ["$_eventId", null] }] }),
              effect("group", "$_groupId", { $and: [complete, { $ne: ["$_groupId", null] }] }),
              {
                $map: {
                  input: { $setDifference: ["$_tableIds", "$_afterTables"] },
                  as: "id",
                  in: { kind: "table", id: "$$id" },
                },
              },
            ],
          },
        },
      },
      { $unwind: "$targets" },
      { $group: { _id: "$targets", count: { $sum: 1 } } },
    ],
  };
}
export const remainingItemTableIds = tableIds("$_items");
