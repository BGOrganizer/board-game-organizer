import { z } from "zod";

/**
 * DTOs for device-contacts sync (`POST /api/contacts/sync`).
 *
 * The mobile app reads the device address book (with user consent) and sends
 * the contact emails here. The API matches them against registered users and
 * persists the matches in the `contactLinks` collection (source: "device") —
 * so the contact list is stored server-side and suggestions don't require
 * re-reading the address book on every visit.
 */

/** Payload: the (normalized) emails from the device address book. */
export const syncContactsSchema = z.object({
  emails: z.array(z.string().email().max(320)).max(1000),
});

/** One matched, persisted contact link. */
export const contactLinkSchema = z.object({
  userId: z.string(),
  contactClerkId: z.string(),
  email: z.string(),
  createdAt: z.date(),
});

export type SyncContactsInput = z.infer<typeof syncContactsSchema>;
export type ContactLink = z.infer<typeof contactLinkSchema>;
