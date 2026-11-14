import type { ObjectId } from "mongodb";

/**
 * DB model: `blocks` collection.
 *
 * One directed edge per block (fromUserId → toUserId). Blocking clears the
 * bidirectional follows/friend-requests/friendships first (soft-cancel), and
 * the block filter is applied consistently everywhere via the shared
 * `applyBlockFilter` helper (Phase 2).
 */
export interface Block {
  _id: ObjectId;
  /** The user who blocked (Clerk user ID). */
  fromUserId: string;
  /** The blocked user (Clerk user ID). */
  toUserId: string;
  createdAt: Date;
}

/** MongoDB indexes for the `blocks` collection. */
export const BLOCK_INDEXES = [
  // A user can block another user at most once.
  { key: { fromUserId: 1, toUserId: 1 }, unique: true },
  // Lookup of "users who blocked X" / "users X blocked".
  { key: { toUserId: 1 } },
] as const;
