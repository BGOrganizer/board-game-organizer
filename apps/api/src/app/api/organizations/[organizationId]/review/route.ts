import { reviewOrganizationSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";
export const OPTIONS = corsPreflight;
export function GET(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  return runCommunityOperation(request, async (userId, service) =>
    service.moderationDetail(userId, communityId((await context.params).organizationId)),
  );
}
export function PATCH(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  return runCommunityOperation(request, async (userId, service) =>
    service.review(
      userId,
      communityId((await context.params).organizationId),
      await communityBody(request, reviewOrganizationSchema),
    ),
  );
}
