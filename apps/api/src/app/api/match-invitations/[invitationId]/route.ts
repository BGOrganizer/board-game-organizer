import { respondMatchInvitationSchema } from "@board-game-organizer/schemas";
import {
  badMatchRequest,
  invitationIdFromContext,
  type MatchInvitationRouteContext,
  matchOptions,
  parseMatchJson,
  runMatchOperation,
} from "@/app/lib/match.http";

export const OPTIONS = matchOptions;

/** Invitee accepts or declines a pending invitation. */
export async function PATCH(request: Request, context: MatchInvitationRouteContext) {
  const invitationId = await invitationIdFromContext(request, context);
  if (!invitationId) return badMatchRequest(request, "Invalid invitation id");
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = respondMatchInvitationSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request, "Invalid request body");
  return runMatchOperation(request, async ({ userId, service }) => ({
    invitation: await service.respond(userId, invitationId, parsed.data.decision),
  }));
}

/** Accepted invitee leaves a match while it is still PLANNING. */
export async function DELETE(request: Request, context: MatchInvitationRouteContext) {
  const invitationId = await invitationIdFromContext(request, context);
  if (!invitationId) return badMatchRequest(request, "Invalid invitation id");
  return runMatchOperation(request, async ({ userId, service }) => {
    await service.leave(userId, invitationId);
  });
}
