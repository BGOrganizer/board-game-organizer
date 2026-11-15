import type { CommunityApiOptions } from "../community/communityApi";
import { uploadCommunityLogo } from "../community/logoUpload";
export function uploadGroupLogo(
  options: CommunityApiOptions,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
) {
  return uploadCommunityLogo(options, "group-assets", base64, mimeType, signal);
}
