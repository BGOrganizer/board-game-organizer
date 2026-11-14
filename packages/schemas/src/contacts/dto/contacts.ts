import { z } from "zod";

/**
 * DTOs for device-contact sync (`POST /api/contacts/sync`).
 *
 * Mobile reads the device address book after user consent and sends contact
 * emails and phone numbers. The API persists registered-user matches only, so
 * suggestions remain available across devices without storing unmatched data.
 */

/** Valid address-book email accepted by contact sync. */
export const contactEmailSchema = z.string().trim().email().max(320);

/** Payload from the device address book. */
export const syncContactsSchema = z.object({
  emails: z.array(contactEmailSchema).max(1000).default([]),
  phoneNumbers: z.array(z.string().max(64)).max(1000).default([]),
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
