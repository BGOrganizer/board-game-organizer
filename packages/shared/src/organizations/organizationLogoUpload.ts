import {
  ORGANIZATION_LOGO_CHUNK_BYTES,
  ORGANIZATION_LOGO_MAX_BYTES,
  startOrganizationLogoSchema,
} from "@board-game-organizer/schemas";
import { type CommunityApiOptions, communityRequest } from "../community/communityApi";
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 32768)
    binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
  return btoa(binary);
}
export async function uploadOrganizationLogo(
  options: CommunityApiOptions,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
) {
  if (base64.length > Math.ceil(ORGANIZATION_LOGO_MAX_BYTES / 3) * 4)
    throw new Error("Invalid organization logo");
  const binary = atob(base64);
  if (btoa(binary) !== base64) throw new Error("Invalid logo");
  const input = startOrganizationLogoSchema.parse({ mimeType, byteLength: binary.length });
  const asset = await communityRequest<{ id: string }>(
    options,
    "organization-assets",
    "POST",
    input,
    signal,
  );
  for (let offset = 0; offset < binary.length; offset += ORGANIZATION_LOGO_CHUNK_BYTES)
    await communityRequest(
      options,
      `organization-assets/${encodeURIComponent(asset.id)}`,
      "PATCH",
      { offset, base64: btoa(binary.slice(offset, offset + ORGANIZATION_LOGO_CHUNK_BYTES)) },
      signal,
    );
  return communityRequest<{ id: string; preview: string }>(
    options,
    `organization-assets/${encodeURIComponent(asset.id)}/complete`,
    "POST",
    {},
    signal,
  );
}
