import type { OrganizationAsset } from "@board-game-organizer/schemas";
import sharp from "sharp";
import { CommunityError } from "./community.error";

/** Decode on the server; MIME declarations alone cannot attest uploaded content. */
export async function prepareOrganizationLogo(
  bytes: Uint8Array,
  mimeType: OrganizationAsset["mimeType"],
) {
  try {
    const image = sharp(bytes, { limitInputPixels: 64_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    const actualMime = `image/${metadata.format}`;
    if (
      actualMime !== mimeType ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new Error("Unsupported image");
    }
    const source = image.rotate();
    const base64 = (
      await source
        .clone()
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
    ).toString("base64");
    const previewBase64 = (
      await source
        .clone()
        .resize({
          width: 512,
          height: 512,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 85 })
        .toBuffer()
    ).toString("base64");
    const thumbnailBase64 = (
      await source
        .clone()
        .resize({
          width: 128,
          height: 128,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80 })
        .toBuffer()
    ).toString("base64");
    // Sharp's default output strips EXIF/location metadata; originals/chunks are not retained.
    return { base64, previewBase64, thumbnailBase64 };
  } catch {
    throw new CommunityError(400, "INVALID_LOGO_IMAGE");
  }
}
