import { z } from "zod";

/**
 * DTOs for invites.
 *
 * - Create: optionally target an email (enables auto-claim on match); the
 *   response carries the shareable link.
 * - Claim: the token from the link; the endpoint validates expiry and email
 *   auto-claim, then connects inviter and claimer.
 */
export const createInviteParamsSchema = z.object({
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
