import { z } from "zod";
import { targetUserIdSchema } from "./common";

/** Payloads for follow / unfollow (`POST|DELETE /api/relationships/follow`). */
export const followParamsSchema = z.object({ targetUserId: targetUserIdSchema });
export type FollowParams = z.infer<typeof followParamsSchema>;
