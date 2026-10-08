import { startOrganizationLogoSchema } from "@board-game-organizer/schemas";
import { corsOptions } from "@/app/lib/cors";
import { communityBody, runOrganizationAssetOperation } from "@/app/lib/organization-assets.http";
export const OPTIONS = corsOptions;
export function POST(request: Request) {
  return runOrganizationAssetOperation(
    request,
    async (userId, service) =>
      service.start(userId, await communityBody(request, startOrganizationLogoSchema)),
    201,
  );
}
