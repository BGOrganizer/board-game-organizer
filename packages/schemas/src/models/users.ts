import type { ObjectId } from "mongodb";

/**
 * DB model: `users` collection.
 *
 * Users are mirrored from Clerk (webhook `user.created/updated/deleted`);
 * the Clerk user ID (`clerkId`) is the stable cross-app identity — the same
 * value returned by `auth()` in route handlers. Presence (online +
 * lastActiveAt) backs the "green dot" UI.
 */
export interface User {
  _id: ObjectId;
  /** Clerk user ID (unique). */
  clerkId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  /** ISO 639-1 language code ("en" | "it") preferred by the user. */
  preferredLanguage: "en" | "it";
  plan: string;
  presence: {
    online: boolean;
    lastActiveAt: Date;
  };
  /** Marks E2E-provisioned test users (mirror of Clerk public_metadata). */
  e2e?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** MongoDB indexes for the `users` collection (created in Phase 1). */
export const USER_INDEXES = [
  { key: { clerkId: 1 }, unique: true },
  { key: { email: 1 } },
  // Prefix (autocomplete) search over name: the search route uses an
  // anchored ^$regex with $options "i", which needs a plain index.
  { key: { name: 1 } },
] as const;
