import type { CommunityApiOptions } from "../community/communityApi";
import { uploadCommunityLogo } from "../community/logoUpload";

export { bytesToBase64 } from "../community/logoUpload";
export function uploadOrganizationLogo(
  options: CommunityApiOptions,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
) {
  return uploadCommunityLogo(options, "organization-assets", base64, mimeType, signal);
}
