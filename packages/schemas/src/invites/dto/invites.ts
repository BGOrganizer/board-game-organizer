import { z } from "zod";

/**
 * DTOs for invites.
 *
 * - Create: the client may pass its own web origin so the shareable link
 *   points at the SAME deployment that generated it (preview → preview web,
 *   production → production web). No email is required anymore.
 * - Claim: the token from the link; the endpoint validates expiry then
 *   connects inviter and claimer as mutual followers/friends.
 */
export const createInviteParamsSchema = z.object({
  /** Origin of the generating app (web: window.location.origin). */
  webOrigin: z.string().url().max(255).optional(),
  /** Optional target email (kept for backwards compatibility). */
  email: z.string().email().max(255).optional(),
});

export const claimInviteParamsSchema = z.object({
  token: z.string().min(8).max(255),
});

export const inviteResultSchema = z.object({
  token: z.string(),
  link: z.string(),
  email: z.string().nullable(),
  expiresAt: z.date(),
});

export type CreateInviteParams = z.infer<typeof createInviteParamsSchema>;
export type ClaimInviteParams = z.infer<typeof claimInviteParamsSchema>;
export type InviteResult = z.infer<typeof inviteResultSchema>;
