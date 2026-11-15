/** biome-ignore-all lint/suspicious/noThenProperty: MongoDB $switch uses literal then fields. */
import type { Document } from "mongodb";
import { COLLECTIONS } from "../db";

const stateKinds = [
  "event_agreement_ready",
  "event_agreement_blocked",
  "event_confirmed",
  "event_replanning",
  "event_terminated",
  "event_cancelled",
];

/** Derived read markers preserve inbox history. Winners include already-read notices. */
export function notificationSupersessionPipeline(asOf: string): Document[] {
  const effective = (item: string, created: string) => ({ $ifNull: [item, created] });
  const newer = (at: unknown) => ({
    $or: [
      { $gt: ["$$candidate.at", at] },
      { $and: [{ $eq: ["$$candidate.at", at] }, { $gt: ["$$candidate._id", "$_id"] }] },
    ],
  });
  const superseded = (item: string | null) => ({
    $and: [
      enabled,
      {
        $gt: [
          {
            $size: {
              $filter: {
                input: "$_successors",
                as: "candidate",
                cond: {
                  $and: [
                    {
                      $or: [
                        { $eq: ["$$candidate.itemId", item ? `${item}.id` : null] },
                        {
                          $and: [
                            { $in: ["$kind", stateKinds] },
                            "$$candidate.state",
                            { $eq: ["$$candidate.href", "$href"] },
                          ],
                        },
                      ],
                    },
                    newer(item ? effective(`${item}.changedAt`, "$createdAt") : "$createdAt"),
                  ],
                },
              },
            },
          },
          0,
        ],
      },
    ],
  });
  // Null lookup parameters disable indexes; false cannot match these schema-owned string IDs.
  const enabled = {
    $and: [
      { $not: [{ $in: ["$kind", ["group_invitation", "table_invitation"]] }] },
      {
        $regexMatch: {
          input: { $ifNull: ["$href", ""] },
          regex: "^/(groups|moderation|events)/[0-9a-f-]{36}(/tables/[0-9a-f-]{36})?$",
          options: "i",
        },
      },
      {
        $or: [
          { $gt: [{ $size: { $ifNull: ["$attentionItems", []] } }, 0] },
          { $in: ["$kind", stateKinds] },
        ],
      },
    ],
  };
  return [
    {
      $lookup: {
        from: COLLECTIONS.NOTIFICATIONS,
        let: {
          recipient: { $cond: [enabled, "$recipientUserId", false] },
          kind: "$kind",
          href: "$href",
          ids: { $ifNull: ["$attentionItems.id", []] },
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$recipientUserId", "$$recipient"] },
                  { $lte: ["$createdAt", new Date(asOf)] },
                  {
                    $or: [
                      { $eq: ["$kind", "$$kind"] },
                      { $and: [{ $in: ["$kind", stateKinds] }, { $in: ["$$kind", stateKinds] }] },
                    ],
                  },
                  {
                    $or: [
                      {
                        $and: [
                          { $in: ["$kind", stateKinds] },
                          { $in: ["$$kind", stateKinds] },
                          { $eq: ["$href", "$$href"] },
                        ],
                      },
                      {
                        $gt: [
                          {
                            $size: {
                              $setIntersection: ["$$ids", { $ifNull: ["$attentionItems.id", []] }],
                            },
                          },
                          0,
                        ],
                      },
                      {
                        $and: [
                          { $eq: [{ $size: "$$ids" }, 0] },
                          { $eq: [{ $size: { $ifNull: ["$attentionItems", []] } }, 0] },
                          { $eq: ["$href", "$$href"] },
                          { $in: ["$$kind", stateKinds] },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
          { $unwind: { path: "$attentionItems", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              itemId: { $ifNull: ["$attentionItems.id", null] },
              href: 1,
              state: { $in: ["$kind", stateKinds] },
              at: effective("$attentionItems.changedAt", "$createdAt"),
            },
          },
          { $match: { at: { $lte: new Date(asOf) } } },
        ],
        as: "_successors",
      },
    },
    {
      $lookup: {
        from: COLLECTIONS.EVENTS,
        let: {
          eventId: {
            $cond: [
              {
                $and: [
                  { $in: ["$kind", stateKinds] },
                  {
                    $regexMatch: {
                      input: { $ifNull: ["$href", ""] },
                      regex: "^/events/[0-9a-f-]{36}$",
                      options: "i",
                    },
                  },
                ],
              },
              { $substrCP: ["$href", 8, 36] },
              false,
            ],
          },
        },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$id", "$$eventId"] },
            },
          },
          { $project: { status: 1, lastNotifiedSituation: 1 } },
          { $limit: 1 },
        ],
        as: "_currentEvent",
      },
    },
    {
      $set: {
        attentionItems: {
          $cond: [
            { $eq: [{ $type: "$attentionItems" }, "missing"] },
            "$$REMOVE",
            {
              $map: {
                input: {
                  $reduce: {
                    input: {
                      $sortArray: {
                        input: {
                          $map: {
                            input: "$attentionItems",
                            as: "point",
                            in: {
                              point: "$$point",
                              at: effective("$$point.changedAt", "$createdAt"),
                            },
                          },
                        },
                        sortBy: { at: -1, "point.revision": -1 },
                      },
                    },
                    initialValue: [],
                    in: {
                      $cond: [
                        { $in: ["$$this.point.id", "$$value.id"] },
                        "$$value",
                        { $concatArrays: ["$$value", ["$$this.point"]] },
                      ],
                    },
                  },
                },
                as: "point",
                in: {
                  $cond: [
                    superseded("$$point"),
                    {
                      $mergeObjects: [
                        "$$point",
                        { readAt: { $ifNull: ["$$point.readAt", "$$NOW"] } },
                      ],
                    },
                    "$$point",
                  ],
                },
              },
            },
          ],
        },
        _staleState: {
          $and: [
            { $in: ["$kind", stateKinds] },
            { $gt: [{ $size: "$_currentEvent" }, 0] },
            {
              $or: [
                {
                  $ne: [
                    { $arrayElemAt: ["$_currentEvent.status", 0] },
                    {
                      $switch: {
                        branches: [
                          { case: { $eq: ["$kind", "event_confirmed"] }, then: "CONFIRMED" },
                          { case: { $eq: ["$kind", "event_terminated"] }, then: "TERMINATED" },
                          { case: { $eq: ["$kind", "event_cancelled"] }, then: "CANCELLED" },
                        ],
                        default: "PLANNING",
                      },
                    },
                  ],
                },
                {
                  $and: [
                    { $eq: ["$kind", "event_agreement_ready"] },
                    {
                      $regexMatch: {
                        input: {
                          $ifNull: [
                            { $arrayElemAt: ["$_currentEvent.lastNotifiedSituation", 0] },
                            "",
                          ],
                        },
                        regex: "^\\s*\\[",
                      },
                    },
                  ],
                },
                {
                  $and: [
                    { $eq: ["$kind", "event_agreement_blocked"] },
                    {
                      $regexMatch: {
                        input: {
                          $ifNull: [
                            { $arrayElemAt: ["$_currentEvent.lastNotifiedSituation", 0] },
                            "",
                          ],
                        },
                        regex: "^\\s*\\{",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    {
      $set: {
        readAt: {
          $cond: [
            {
              $or: [
                "$_staleState",
                {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$attentionItems", []] } }, 0] },
                    {
                      $allElementsTrue: {
                        $map: {
                          input: "$attentionItems",
                          as: "point",
                          in: { $ne: [{ $ifNull: ["$$point.readAt", null] }, null] },
                        },
                      },
                    },
                    superseded(null),
                  ],
                },
              ],
            },
            { $ifNull: ["$readAt", "$$NOW"] },
            { $ifNull: ["$readAt", "$$REMOVE"] },
          ],
        },
      },
    },
    { $unset: ["_successors", "_currentEvent", "_staleState"] },
  ];
}
