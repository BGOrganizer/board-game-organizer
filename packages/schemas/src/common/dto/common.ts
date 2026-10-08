import { z } from "zod";

/**
 * Shared DTO pieces used by several relationship endpoints.
 * All identifiers are Clerk user IDs (strings), never ObjectIds.
 */

/** A Clerk user ID passed as a route/body target. */
export const targetUserIdSchema = z.string().trim().min(1).max(255);

/** Cursor-based pagination: opaque base64 cursor + page size (1-50, default 20). */
export const cursorSchema = z.string().min(1).max(1024);
export const limitSchema = z.coerce
  .number()
  .int()
  .default(20)
  .transform((value) => Math.min(50, Math.max(1, value)));

/** Standard envelope param object shared by list-style endpoints. */
export const listParamsSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: limitSchema,
});

export type ListParams = z.infer<typeof listParamsSchema>;
