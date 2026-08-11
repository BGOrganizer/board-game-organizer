// apps/api/src/lib/relationship.lists.ts
export const LISTS = {
  followers: ["follow", "accepted", "to"],
  following: ["follow", "accepted", "from"],
  friends: ["friend", "accepted", "from"],
  pending: ["friend_request", "pending", "to"],
  sent: ["friend_request", "pending", "from"],
} as const;

export type ListType = keyof typeof LISTS;
