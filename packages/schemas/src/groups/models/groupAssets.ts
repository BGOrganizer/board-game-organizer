import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";

export const GROUP_LOGO_MAX_BYTES = 5_000_000;
export const GROUP_LOGO_CHUNK_BYTES = 256_000;
export const groupLogoMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
export const groupAssetSchema = z.object({
  id: z.uuid(),
  ownerUserId: targetUserIdSchema,
  groupId: z.uuid().optional(),
  mimeType: groupLogoMimeSchema,
  byteLength: z.number().int().min(1).max(GROUP_LOGO_MAX_BYTES),
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
export type GroupAsset = z.infer<typeof groupAssetSchema>;
export const GROUP_ASSET_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { ownerUserId: 1, status: 1 } },
  { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
] as const;
