import type { ObjectId } from "mongodb";

/** Lifecycle of an invite. */
export type InviteStatus = "pending" | "claimed" | "expired" | "revoked";

/** Invite validity window (7 days), per the product spec. */
export const INVITE_TTL_DAYS = 7;

/**
 * DB model: `invites` collection.
 *
 * An invite is a shareable link (`https://…/invite/<token>`) that lets a new
 * or existing user connect with the inviter. If the invite carries an email,
 * claiming it is auto-accepted when the authenticated user's email matches.
 */
export interface Invite {
  _id: ObjectId;
  /** URL-safe token, unique, used in the shareable link. */
  token: string;
  /** The inviter (Clerk user ID). */
  inviterUserId: string;
  /** Optional target email — enables auto-claim on email match. */
  email?: string;
  status: InviteStatus;
  /** Token expiry: `createdAt + INVITE_TTL_DAYS`. */
  expiresAt: Date;
  createdAt: Date;
  claimedAt?: Date;
  /** The user who claimed the invite (Clerk user ID). */
  claimedByUserId?: string;
}

/** MongoDB indexes for the `invites` collection. */
export const INVITE_INDEXES = [
  { key: { token: 1 }, unique: true },
  // Pending (non-expired) invites per inviter.
  { key: { inviterUserId: 1, status: 1 } },
  // Background cleanup of expired invites.
  { key: { status: 1, expiresAt: 1 } },
] as const;
