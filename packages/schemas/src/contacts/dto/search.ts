import { z } from "zod";
import { cursorSchema, limitSchema } from "../../common/dto/common";

/** Filters for the authenticated user directory. */
export const searchContactsParamsSchema = z.object({
  query: z.string().trim().min(1).max(100),
  friendsOnly: z.enum(["true", "false"]).optional(),
  scope: z.literal("discovery").optional(),
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
