import type { ObjectId } from "mongodb";

/** Lifecycle of a friend request. */
export type FriendRequestStatus = "pending" | "accepted" | "rejected";

/**
 * DB model: `friendRequests` collection.
 *
 * A friend request is a directed edge (fromUserId → toUserId). When both
 * sides request each other, the requests are cross-resolved and a friendship
 * is derived from a pair of `accepted` requests. Friendship itself is NOT a
 * collection: it is the union of two accepted friend requests.
 */
export interface FriendRequest {
  _id: ObjectId;
  /** The sender (Clerk user ID). */
  fromUserId: string;
  /** The recipient (Clerk user ID). */
  toUserId: string;
  status: FriendRequestStatus;
  createdAt: Date;
  /** Set when the request leaves `pending` (accept or reject). */
  respondedAt?: Date;
  updatedAt: Date;
}

/** MongoDB indexes for the `friendRequests` collection. */
export const FRIEND_REQUEST_INDEXES = [
  // At most ONE pending request per ordered pair — an incoming request on the
  // opposite direction is resolved (cross-accept), never duplicated.
  {
    key: { fromUserId: 1, toUserId: 1 },
    unique: true,
    partialFilterExpression: { status: "pending" },
  },
  // "Received requests" list for a user.
  { key: { toUserId: 1, status: 1, createdAt: -1 } },
] as const;
