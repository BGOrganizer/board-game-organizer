import { z } from "zod";
import { cursorSchema, limitSchema } from "./common";

/**
 * DTOs for contact search (`GET /api/relationships/search`).
 *
 * Search runs against the MongoDB text index with a Clerk API fallback, is
 * rate limited (20 req/min), and is block-filtered (asymmetric: users you
 * blocked are hidden, users who blocked you remain findable by explicit
 * name search so the blocker perceives nothing).
 */
export const searchContactsParamsSchema = z.object({
  query: z.string().trim().min(1).max(100),
  cursor: cursorSchema.optional(),
  limit: limitSchema,
});

/** Envelope returned by the search endpoint. */
export const searchContactsResultSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      presence: z.object({ online: z.boolean(), lastActiveAt: z.date() }),
    }),
  ),
  nextCursor: cursorSchema.nullable(),
});

export type SearchContactsParams = z.infer<typeof searchContactsParamsSchema>;
export type SearchContactsResult = z.infer<typeof searchContactsResultSchema>;
