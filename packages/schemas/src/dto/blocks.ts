import { z } from "zod";
import { targetUserIdSchema } from "./common";

/** Payloads for block / unblock (`POST|DELETE /api/relationships/block`). */
export const blockParamsSchema = z.object({ targetUserId: targetUserIdSchema });
export type BlockParams = z.infer<typeof blockParamsSchema>;
