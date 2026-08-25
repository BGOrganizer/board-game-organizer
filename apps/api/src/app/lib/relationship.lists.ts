// apps/api/src/lib/relationship.lists.ts
export const LISTS = {
  followers: ["follow", "accepted", "to"],
  following: ["follow", "accepted", "from"],
  friends: ["friend", "accepted", "from"],
  pending: ["friend_request", "pending", "to"],
  sent: ["friend_request", "pending", "from"],
  // Blocked list: shows exactly the users the viewer blocked, so they can be
  // unblocked (they are hidden everywhere else).
  blocked: ["block", "blocked", "from"],
} as const;

export type ListType = keyof typeof LISTS;
