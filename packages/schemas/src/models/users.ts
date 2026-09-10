import type { ObjectId } from "mongodb";

export const MOBILE_NUMBER_METADATA_KEY = "mobileNumber";

/** Reads required custom signup value without applying phone-format validation. */
export function getMobileNumber(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[MOBILE_NUMBER_METADATA_KEY];
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

/** Best-effort lookup key only; signup still accepts any non-empty string. */
export function normalizePhoneNumberForMatching(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const digits = value.replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : undefined;
}

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
  /** Custom signup value. Intentionally stored without phone-format validation. */
  mobileNumber?: string;
  /** Sanitized lookup key. Never returned by social APIs. */
  mobileNumberNormalized?: string;
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
  { key: { mobileNumberNormalized: 1 } },
  // Prefix (autocomplete) search over name: the search route uses an
  // anchored ^$regex with $options "i", which needs a plain index.
  { key: { name: 1 } },
] as const;
