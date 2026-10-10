import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";
import {
  ORGANIZATION_LOGO_CHUNK_BYTES,
  ORGANIZATION_LOGO_MAX_BYTES,
  organizationLogoMimeSchema,
  organizationRevisionSchema,
} from "../models/organizations";

export const saveOrganizationSchema = organizationRevisionSchema.strict();
export type SaveOrganizationInput = z.infer<typeof saveOrganizationSchema>;
export const updateOrganizationSchema = saveOrganizationSchema.extend({
  version: z.number().int().positive(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export const reviewOrganizationSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), version: z.number().int().positive() }).strict(),
  z
    .object({
      decision: z.literal("reject"),
      version: z.number().int().positive(),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export type ReviewOrganizationInput = z.infer<typeof reviewOrganizationSchema>;
export const inviteOrganizationMemberSchema = z.object({ userId: targetUserIdSchema }).strict();
export const organizationMembershipActionSchema = z
  .object({
    action: z.enum(["accept", "decline", "approve", "reject", "cancel", "remove", "ban", "revoke"]),
  })
  .strict();
export type OrganizationMembershipAction = z.infer<typeof organizationMembershipActionSchema>;
export const organizationEmptyActionSchema = z.object({}).strict();

export const startOrganizationLogoSchema = z
  .object({
    mimeType: organizationLogoMimeSchema,
    byteLength: z.number().int().min(1).max(ORGANIZATION_LOGO_MAX_BYTES),
  })
  .strict();
export type StartOrganizationLogoInput = z.infer<typeof startOrganizationLogoSchema>;
export const uploadOrganizationLogoChunkSchema = z
  .object({
    offset: z.number().int().min(0).max(ORGANIZATION_LOGO_MAX_BYTES),
    base64: z
      .string()
      .min(4)
      .max(Math.ceil(ORGANIZATION_LOGO_CHUNK_BYTES / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  })
  .strict();
export type UploadOrganizationLogoChunkInput = z.infer<typeof uploadOrganizationLogoChunkSchema>;
