import { organizationEmptyActionSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";
export const OPTIONS = corsPreflight;
export function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  return runCommunityOperation(
    request,
    async (userId, service) => {
      await communityBody(request, organizationEmptyActionSchema);
      return service.request(userId, communityId((await context.params).organizationId));
    },
    201,
  );
}
