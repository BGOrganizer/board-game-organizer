import type { Document } from "mongodb";

/** Decode only canonical resource identity, never notification text or cross-entity ancestry. */
export function itemOwnerIds(input: string, resource: "event" | "table" | "group") {
  return {
    $reduce: {
      input,
      initialValue: [],
      in: {
        $let: {
          vars: {
            owner: {
              $regexFind: {
                input: "$$this.id",
                regex: `^\\[\\s*"${resource}"\\s*,\\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"\\s*,`,
                options: "i",
              },
            },
          },
          in: {
            $cond: [
              { $ne: ["$$owner", null] },
              { $setUnion: ["$$value", [{ $arrayElemAt: ["$$owner.captures", 0] }]] },
              "$$value",
            ],
          },
        },
      },
    },
  };
}
/** Tab navigation contains actual owner rows; it does not make their parents entity owners. */
export function ownerListTargets(events: string, groups: string) {
  return {
    $concatArrays: [
      {
        $cond: [
          { $gt: [{ $size: events }, 0] },
          { $ifNull: [{ $arrayElemAt: ["$_event.lists", 0] }, []] },
          [],
        ],
      },
      {
        $cond: [
          { $gt: [{ $size: groups }, 0] },
          { $ifNull: [{ $arrayElemAt: ["$_group.lists", 0] }, []] },
          [],
        ],
      },
    ],
  };
}
export function itemFacet(id: string): { total: Document[]; effects: Document[] } {
  const complete = {
    $and: [
      { $eq: [{ $size: "$_afterItems" }, 0] },
      // Hidden unauthorized items remain unread; an owned item ACK cannot consume them.
      { $eq: [{ $size: { $ifNull: ["$_unscopedItems", "$_items"] } }, { $size: "$_items" }] },
    ],
  };
  const lost = (before: string, after: string) => ({
    $and: [{ $gt: [{ $size: before }, 0] }, { $eq: [{ $size: after }, 0] }],
  });
  const removed = (kind: string, before: string, after: string) => ({
    $map: {
      input: { $setDifference: [before, after] },
      as: "id",
      in: { kind, id: "$$id" },
    },
  });
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
        _afterTables: { $setIntersection: [itemOwnerIds("$_afterItems", "table"), "$_tableIds"] },
        _afterEvents: {
          $setIntersection: [itemOwnerIds("$_afterItems", "event"), "$_ownerEvents"],
        },
        _afterGroups: {
          $setIntersection: [itemOwnerIds("$_afterItems", "group"), "$_ownerGroups"],
        },
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
          tables: { $sum: { $cond: [lost("$_tableIds", "$_afterTables"), 1, 0] } },
          events: { $sum: { $cond: [lost("$_ownerEvents", "$_afterEvents"), 1, 0] } },
          groups: { $sum: { $cond: [lost("$_ownerGroups", "$_afterGroups"), 1, 0] } },
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
              { $setDifference: ["$_lists", ownerListTargets("$_afterEvents", "$_afterGroups")] },
              removed("event", "$_ownerEvents", "$_afterEvents"),
              removed("group", "$_ownerGroups", "$_afterGroups"),
              removed("table", "$_tableIds", "$_afterTables"),
            ],
          },
        },
      },
      { $unwind: "$targets" },
      { $group: { _id: "$targets", count: { $sum: 1 } } },
    ],
  };
}
