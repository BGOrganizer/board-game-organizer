import { uploadOrganizationLogoChunkSchema } from "@board-game-organizer/schemas";
import { corsOptions } from "@/app/lib/cors";
import {
  communityBody,
  communityId,
  runOrganizationAssetOperation,
} from "@/app/lib/organization-assets.http";
export const OPTIONS = corsOptions;
type Context = { params: Promise<{ assetId: string }> };
export function GET(request: Request, context: Context) {
  return runOrganizationAssetOperation(request, async (userId, service) =>
    service.preview(userId, communityId((await context.params).assetId)),
  );
}
export function PATCH(request: Request, context: Context) {
  return runOrganizationAssetOperation(request, async (userId, service) =>
    service.append(
      userId,
      communityId((await context.params).assetId),
      await communityBody(request, uploadOrganizationLogoChunkSchema),
    ),
  );
}
