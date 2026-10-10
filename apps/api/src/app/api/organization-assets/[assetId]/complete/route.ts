import { organizationEmptyActionSchema } from "@board-game-organizer/schemas";
import { corsOptions } from "@/app/lib/cors";
import {
  communityBody,
  communityId,
  runOrganizationAssetOperation,
} from "@/app/lib/organizations/organization-assets.http";
export const OPTIONS = corsOptions;
export function POST(request: Request, context: { params: Promise<{ assetId: string }> }) {
  return runOrganizationAssetOperation(request, async (userId, service) => {
    const id = communityId((await context.params).assetId);
    await communityBody(request, organizationEmptyActionSchema);
    return service.complete(userId, id);
  });
}
