import { z } from "zod";

/**
 * DTO for the presence heartbeat (`POST /api/relationships/presence`).
 *
 * Clients ping this endpoint on an interval and when the app goes to
 * background/foreground; the API updates `lastActiveAt` and derives the
 * `online` flag (online = heartbeat within the staleness window).
 */
export const presenceUpdateParamsSchema = z.object({
  /** Explicit client state; `online` is derived from recency server-side. */
  status: z.enum(["online", "offline", "away"]),
});

export type PresenceUpdateParams = z.infer<typeof presenceUpdateParamsSchema>;
