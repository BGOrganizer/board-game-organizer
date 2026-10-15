import {
  organizationMembershipActionSchema,
  targetUserIdSchema,
} from "@board-game-organizer/schemas";
import { CommunityError } from "@/app/lib/community.error";
import { communityBody, communityId, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";
export const OPTIONS = corsPreflight;
export function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; userId: string }> },
) {
  return runCommunityOperation(request, async (userId, service) => {
    const params = await context.params;
    const target = targetUserIdSchema.safeParse(params.userId);
    if (!target.success) throw new CommunityError(400, "INVALID_USER_ID");
    return service.membershipAction(
      userId,
      communityId(params.organizationId),
      target.data,
      (await communityBody(request, organizationMembershipActionSchema)).action,
    );
  });
}
