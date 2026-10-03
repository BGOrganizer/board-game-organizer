import {
  badMatchRequest,
  type MatchAdminInvitationRouteContext,
  matchAdminInvitationIdsFromContext,
  matchOptions,
  runMatchOperation,
} from "@/app/lib/match.http";

export const OPTIONS = matchOptions;

/** Match admin removes pending, declined, or accepted invitation while PLANNING. */
export async function DELETE(request: Request, context: MatchAdminInvitationRouteContext) {
  const ids = await matchAdminInvitationIdsFromContext(request, context);
  if (!ids) return badMatchRequest(request, "Invalid match or invitation id");
  return runMatchOperation(request, async ({ userId, service }) => {
    await service.removeInvitation(userId, ids.matchId, ids.invitationId);
  });
}
