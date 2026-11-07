import type { CommunityNetwork, ProfileActivityKind } from "@board-game-organizer/schemas";
import type { Document } from "mongodb";
import { COLLECTIONS as C } from "../db";

/** Current directed follow / reciprocal accepted friendship, never incoming followers or UI lists. */
function networkStages(viewer: string, network: CommunityNetwork): Document[] {
  const asDate = (input: unknown) => ({
    $convert: { input, to: "date", onError: null, onNull: null },
  });
  const follow = { $arrayElemAt: ["$_follows.since", 0] },
    friend = { $arrayElemAt: ["$_friends.since", 0] };
  return [
    { $match: { userId: { $ne: viewer } } },
    {
      $lookup: {
        from: C.FOLLOWS,
        let: { author: "$userId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ["$fromUserId", viewer] }, { $eq: ["$toUserId", "$$author"] }],
              },
            },
          },
          { $project: { since: asDate("$createdAt") } },
          { $limit: 1 },
        ],
        as: "_follows",
      },
    },
    {
      $lookup: {
        from: C.FRIEND_REQUESTS,
        let: { author: "$userId" },
        pipeline: [
          {
            $match: {
              status: "accepted",
              $expr: {
                $or: [
                  { $and: [{ $eq: ["$fromUserId", viewer] }, { $eq: ["$toUserId", "$$author"] }] },
                  { $and: [{ $eq: ["$fromUserId", "$$author"] }, { $eq: ["$toUserId", viewer] }] },
                ],
              },
            },
          },
          {
            $project: { fromUserId: 1, since: asDate({ $ifNull: ["$respondedAt", "$updatedAt"] }) },
          },
          {
            $group: {
              _id: null,
              directions: { $addToSet: "$fromUserId" },
              since: { $max: "$since" },
              invalid: { $sum: { $cond: [{ $eq: ["$since", null] }, 1, 0] } },
            },
          },
          { $match: { invalid: 0, $expr: { $eq: [{ $size: "$directions" }, 2] } } },
        ],
        as: "_friends",
      },
    },
    {
      $set: {
        _since:
          network === "friends"
            ? friend
            : network === "following"
              ? follow
              : {
                  $let: {
                    vars: { f: { $ifNull: [follow, null] }, g: { $ifNull: [friend, null] } },
                    in: {
                      $cond: [
                        { $eq: ["$$f", null] },
                        "$$g",
                        { $cond: [{ $eq: ["$$g", null] }, "$$f", { $min: ["$$f", "$$g"] }] },
                      ],
                    },
                  },
                },
      },
    },
    {
      $match: {
        $expr: {
          $and: [
            { $ne: [{ $ifNull: ["$_since", null] }, null] },
            { $ne: [asDate("$occurredAt"), null] },
            { $gte: [asDate("$occurredAt"), "$_since"] },
          ],
        },
      },
    },
  ];
}

/** One row for the first Table/Event join, without deleting either durable receipt. */
export function joinedEventSuppression(): Document[] {
  return [
    {
      $lookup: {
        from: C.PROFILE_ACTIVITIES,
        let: { author: "$userId", event: "$eventId", at: "$occurredAt", kind: "$kind" },
        pipeline: [
          {
            $match: {
              kind: "table_join",
              $expr: {
                $and: [
                  { $eq: ["$$kind", "event_join"] },
                  { $eq: ["$userId", "$$author"] },
                  { $eq: ["$eventId", "$$event"] },
                  { $eq: ["$occurredAt", "$$at"] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: C.EVENT_TABLES,
              let: { table: "$tableId", event: "$eventId" },
              pipeline: [
                {
                  $match: {
                    removedAt: { $exists: false },
                    $expr: {
                      $and: [{ $eq: ["$id", "$$table"] }, { $eq: ["$eventId", "$$event"] }],
                    },
                  },
                },
                { $limit: 1 },
                { $project: { _id: 1 } },
              ],
              as: "_liveTable",
            },
          },
          { $match: { "_liveTable.0": { $exists: true } } },
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "_tableJoin",
      },
    },
    { $match: { "_tableJoin.0": { $exists: false } } },
  ];
}

export function communityActivityStages(
  viewer: string,
  network: CommunityNetwork,
  blocked: string[],
  cursor?: string,
  kind?: ProfileActivityKind,
): Document[] {
  const [at, id] = cursor?.split("|") ?? [];
  const visible = { userId: { $nin: [viewer, ...blocked] }, otherUserId: { $nin: blocked } };
  return [
    {
      $match: {
        ...visible,
        ...(kind ? { kind } : {}),
        ...(at && id
          ? { $or: [{ occurredAt: { $lt: at } }, { occurredAt: at, id: { $lt: id } }] }
          : {}),
      },
    },
    { $sort: { occurredAt: -1, id: -1 } },
    ...networkStages(viewer, network),
    // Choose a stable representative among eligible receipts. Lookup deliberately has no cursor:
    // applying it here would resurrect the second side of an already-returned friendship.
    {
      $lookup: {
        from: C.PROFILE_ACTIVITIES,
        let: { source: "$source", id: "$id", kind: "$kind" },
        pipeline: [
          {
            $match: {
              ...visible,
              kind: "friendship",
              $expr: {
                $and: [
                  { $eq: ["$$kind", "friendship"] },
                  { $eq: ["$source", "$$source"] },
                  { $gt: ["$id", "$$id"] },
                ],
              },
            },
          },
          ...networkStages(viewer, network),
          { $limit: 1 },
          { $project: { _id: 1 } },
        ],
        as: "_duplicate",
      },
    },
    { $match: { "_duplicate.0": { $exists: false } } },
    ...joinedEventSuppression(),
    { $limit: 50 },
    { $project: { _id: 0, _follows: 0, _friends: 0, _since: 0, _duplicate: 0, _tableJoin: 0 } },
  ];
}
