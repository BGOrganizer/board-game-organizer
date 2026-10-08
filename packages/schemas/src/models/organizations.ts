import { z } from "zod";
import { targetUserIdSchema } from "../dto/common";
import { matchLocationSchema } from "./matches";

export const ORGANIZATION_LOGO_MAX_BYTES = 5_000_000;
export const ORGANIZATION_LOGO_CHUNK_BYTES = 256_000;
export const organizationLogoMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

export const organizationRevisionSchema = z.object({
  name: z.string().trim().min(5).max(120),
  logoAssetId: z.uuid(),
  location: matchLocationSchema,
});
export type OrganizationRevision = z.infer<typeof organizationRevisionSchema>;

export const organizationModel = z.object({
  id: z.uuid(),
  adminUserId: targetUserIdSchema,
  status: z.enum(["PENDING", "CREATED", "MODIFIED"]),
  approved: organizationRevisionSchema.optional(),
  proposal: organizationRevisionSchema.optional(),
  reviewStatus: z.enum(["PENDING", "REJECTED"]).optional(),
  rejectionReason: z.string().min(1).max(1000).optional(),
  reservedNames: z.array(z.string().min(1)).min(1),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Organization = z.infer<typeof organizationModel>;

export const organizationMembershipStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "LEFT",
  "EXCLUDED",
]);
export const organizationMembershipModel = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  userId: targetUserIdSchema,
  kind: z.enum(["INVITATION", "REQUEST"]),
  status: organizationMembershipStatusSchema,
  excludedReason: z.enum(["REMOVED", "BANNED"]).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type OrganizationMembership = z.infer<typeof organizationMembershipModel>;

export const organizationAssetModel = z.object({
  id: z.uuid(),
  ownerUserId: targetUserIdSchema,
  organizationId: z.uuid().optional(),
  mimeType: organizationLogoMimeSchema,
  byteLength: z.number().int().min(1).max(ORGANIZATION_LOGO_MAX_BYTES),
  receivedBytes: z.number().int().nonnegative(),
  status: z.enum(["UPLOADING", "READY"]),
  base64: z.string(),
  chunks: z
    .array(z.object({ offset: z.number().int().nonnegative(), base64: z.string() }))
    .optional(),
  previewBase64: z.string().optional(),
  thumbnailBase64: z.string().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.date().optional(),
});
export type OrganizationAsset = z.infer<typeof organizationAssetModel>;

export const ORGANIZATION_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { reservedNames: 1 }, unique: true },
  { key: { adminUserId: 1, createdAt: -1, id: -1 } },
  { key: { reviewStatus: 1, updatedAt: 1, id: 1 } },
  { key: { "approved.name": 1 } },
] as const;
export const ORGANIZATION_MEMBERSHIP_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { organizationId: 1, userId: 1 }, unique: true },
  { key: { userId: 1, status: 1, organizationId: 1 } },
  { key: { organizationId: 1, status: 1, createdAt: -1, id: -1 } },
] as const;
export const ORGANIZATION_ASSET_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { ownerUserId: 1, status: 1 } },
  { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
] as const;
