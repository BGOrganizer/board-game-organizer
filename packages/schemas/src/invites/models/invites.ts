import type { ObjectId } from "mongodb";
import type { TableInviteClaimReceipt } from "../dto/invites";

/** Lifecycle of an invite. */
export type InviteStatus = "pending" | "claimed" | "expired" | "revoked";

/** Invite validity window (7 days), per the product spec. */
export const INVITE_TTL_DAYS = 7;

/**
 * DB model: `invites` collection.
 *
 * A shareable, single-use link for a new or existing user. Accepted claims create
 * mutual friendship; contextual links also accept their disclosed Group/Table participation.
 */
export interface Invite {
  _id: ObjectId;
  /** URL-safe token, unique, used in the shareable link. */
  token: string;
  /** The inviter (Clerk user ID). */
  inviterUserId: string;
  /** Absent for the existing friendship-only link. */
  tableId?: string;
  /** Retained legacy metadata; an authenticated recipient still explicitly accepts the link. */
  email?: string;
  status: InviteStatus;
  /** Token expiry: `createdAt + INVITE_TTL_DAYS`. */
  expiresAt: Date;
  createdAt: Date;
  claimedAt?: Date;
  /** The user who claimed the invite (Clerk user ID). */
  claimedByUserId?: string;
  /** Immutable acknowledgment for retrying the same contextual acceptance without replaying effects. */
  tableReceipt?: TableInviteClaimReceipt;
}

/** MongoDB indexes for the `invites` collection. */
export const INVITE_INDEXES = [
  { key: { token: 1 }, unique: true },
  // Pending (non-expired) invites per inviter.
  { key: { inviterUserId: 1, status: 1 } },
  // Background cleanup of expired invites.
  { key: { status: 1, expiresAt: 1 } },
] as const;
