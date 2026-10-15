import { updateOrganizationSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";

type Context = { params: Promise<{ organizationId: string }> };
export const OPTIONS = corsPreflight;
export function GET(request: Request, context: Context) {
  return runCommunityOperation(request, async (userId, service) =>
    service.detail(userId, communityId((await context.params).organizationId)),
  );
}
export function PATCH(request: Request, context: Context) {
  return runCommunityOperation(request, async (userId, service) =>
    service.save(
      userId,
      await communityBody(request, updateOrganizationSchema),
      communityId((await context.params).organizationId),
    ),
  );
}
