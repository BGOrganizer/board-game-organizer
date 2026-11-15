/** Current Group authority, never historical authorship of a grouped Event. */
export function managedEventExpression(userId: string, eventPrefix = "") {
  return {
    $or: [
      {
        $and: [
          { $eq: [{ $ifNull: [`$${eventPrefix}groupId`, null] }, null] },
          { $eq: [`$${eventPrefix}adminUserId`, userId] },
        ],
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
          {
            $and: [
              { $eq: [{ $arrayElemAt: ["$parentGroup.type", 0] }, "PUBLIC"] },
              { $ne: [{ $ifNull: ["$visibility", "PUBLIC"] }, "PRIVATE"] },
            ],
          },
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

/** Frozen attendance or current authority; a historical queue/invitation is not attendance. */
export function terminatedEventExpression(userId: string) {
  return {
    $and: [
      { $eq: ["$status", "TERMINATED"] },
      {
        $or: [managedEventExpression(userId), { $gt: [{ $size: "$personalFrozenTable" }, 0] }],
      },
    ],
  };
}
