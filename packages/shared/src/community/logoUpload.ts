import {
  GROUP_LOGO_CHUNK_BYTES,
  GROUP_LOGO_MAX_BYTES,
  startGroupLogoSchema,
} from "@board-game-organizer/schemas";
import { type CommunityApiOptions, communityRequest } from "./communityApi";
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 32768)
    binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
  return btoa(binary);
}
/** Shared only while the existing organization callers are being cut over to groups. */
export async function uploadCommunityLogo(
  options: CommunityApiOptions,
  resource: "group-assets" | "organization-assets",
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
) {
  if (base64.length > Math.ceil(GROUP_LOGO_MAX_BYTES / 3) * 4)
    throw new Error(
      resource === "organization-assets" ? "Invalid organization logo" : "Invalid group logo",
    );
  const binary = atob(base64);
  if (btoa(binary) !== base64) throw new Error("Invalid logo");
  const input = startGroupLogoSchema.parse({ mimeType, byteLength: binary.length });
  const asset = await communityRequest<{ id: string }>(options, resource, "POST", input, signal);
  for (let offset = 0; offset < binary.length; offset += GROUP_LOGO_CHUNK_BYTES)
    await communityRequest(
      options,
      `${resource}/${encodeURIComponent(asset.id)}`,
      "PATCH",
      { offset, base64: btoa(binary.slice(offset, offset + GROUP_LOGO_CHUNK_BYTES)) },
      signal,
    );
  return communityRequest<{ id: string; preview: string }>(
    options,
    `${resource}/${encodeURIComponent(asset.id)}/complete`,
    "POST",
    {},
    signal,
  );
}
