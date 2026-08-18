import { z } from "zod";
import { listParamsSchema } from "./common";

/** Envelope shape of a block-filtered user returned by relationship lists. */
export const contactUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  presence: z.object({ online: z.boolean(), lastActiveAt: z.date() }),
});

export type ContactUser = z.infer<typeof contactUserSchema>;

/** Public payload returned by `GET /api/profiles` (mirror of Claude profile). */
export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string(),
  preferredLanguage: z.string(),
});

// Re-exported for convenience by the models resolver.
export const PAGINATION = listParamsSchema;
export type PublicUser = z.infer<typeof publicUserSchema>;
