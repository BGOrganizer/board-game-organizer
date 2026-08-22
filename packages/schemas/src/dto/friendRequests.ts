import { z } from "zod";
import { cursorSchema, limitSchema, targetUserIdSchema } from "./common";

/**
 * DTOs for friend requests and friendships.
 *
 * - send / cancel target a user (ordered pair).
 * - respond targets the request itself (id + action), supporting the
 *   cross-resolution of A→B and B→A requests.
 * - friends is cursor-paginated; friendship is derived from a pair of
 *   `accepted` friend requests.
 */
export const sendFriendRequestParamsSchema = z.object({
  targetUserId: targetUserIdSchema,
});

export const cancelFriendRequestParamsSchema = z.object({
  targetUserId: targetUserIdSchema,
});

export const respondFriendRequestParamsSchema = z.object({
  requestId: targetUserIdSchema,
  action: z.enum(["accept", "reject"]),
});

export const unfriendParamsSchema = z.object({
  targetUserId: targetUserIdSchema,
});

export const friendsParamsSchema = z.object({
  cursor: cursorSchema.optional(),
  limit: limitSchema,
});

export type SendFriendRequestParams = z.infer<typeof sendFriendRequestParamsSchema>;
export type CancelFriendRequestParams = z.infer<typeof cancelFriendRequestParamsSchema>;
export type RespondFriendRequestParams = z.infer<typeof respondFriendRequestParamsSchema>;
export type UnfriendParams = z.infer<typeof unfriendParamsSchema>;
export type FriendsParams = z.infer<typeof friendsParamsSchema>;
