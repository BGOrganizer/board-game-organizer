/** Current Group authority, never historical authorship of a grouped Event. */
export function managedEventExpression(userId: string) {
  return {
    $or: [
      {
        $and: [{ $eq: [{ $ifNull: ["$groupId", null] }, null] }, { $eq: ["$adminUserId", userId] }],
      },
      { $eq: [{ $arrayElemAt: ["$parentGroup.adminUserId", 0] }, userId] },
      { $in: ["MODERATOR", "$groupMembership.role"] },
    ],
  };
}
/** Evaluated after visibleGroups(): accepted Group authority and exact public cutoff. */
export function availableEventExpression(userId: string, now: Date) {
  return {
    $and: [
      { $eq: ["$status", "PLANNING"] },
      { $not: [managedEventExpression(userId)] },
      { $ne: [{ $ifNull: ["$groupId", null] }, null] },
      {
        $or: [
          { $eq: [{ $arrayElemAt: ["$parentGroup.adminUserId", 0] }, userId] },
          { $gt: [{ $size: "$groupMembership" }, 0] },
        ],
      },
      {
        $or: [
          { $ne: [{ $arrayElemAt: ["$parentGroup.type", 0] }, "PUBLIC"] },
          {
            $gt: [
              { $convert: { input: "$bookingClosesAt", to: "date", onError: null, onNull: null } },
              now,
            ],
          },
        ],
      },
    ],
  };
}
