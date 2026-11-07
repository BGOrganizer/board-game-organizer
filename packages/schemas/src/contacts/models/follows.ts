import type { ObjectId } from "mongodb";

/**
 * DB model: `follows` collection.
 *
 * One directed edge per follow (fromUserId → toUserId). Follows are
 * independent of friendships (you can follow a stranger) and are
 * immediately "accepted" — no pending state.
 */
export interface Follow {
  _id: ObjectId;
  /** The follower (Clerk user ID). */
  fromUserId: string;
  /** The followed user (Clerk user ID). */
  toUserId: string;
  createdAt: Date;
}

/** MongoDB indexes for the `follows` collection. */
export const FOLLOW_INDEXES = [
  // A user can follow another user at most once.
  { key: { fromUserId: 1, toUserId: 1 }, unique: true },
  // Reverse lookup: "who follows me" lists.
  { key: { toUserId: 1 } },
] as const;
