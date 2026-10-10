import { z } from "zod";
import {
  badMatchRequest,
  type MatchAdminInvitationRouteContext,
  matchAdminInvitationIdsFromContext,
  matchOptions,
  parseMatchJson,
  runMatchOperation,
} from "@/app/lib/matches/match.http";

export const OPTIONS = matchOptions;

/** Only the match administrator may approve a pending self-request. */
export async function PATCH(request: Request, context: MatchAdminInvitationRouteContext) {
  const ids = await matchAdminInvitationIdsFromContext(request, context);
  if (!ids) return badMatchRequest(request);
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  if (
    !z
      .object({ action: z.literal("accept") })
      .strict()
      .safeParse(body.data).success
  )
    return badMatchRequest(request);
  return runMatchOperation(request, async ({ service, userId }) => ({
    invitation: await service.approveJoinRequest(userId, ids.matchId, ids.invitationId),
  }));
}
