import { inviteMatchUserSchema } from "@board-game-organizer/schemas";
import {
  badMatchRequest,
  type MatchRouteContext,
  matchIdFromContext,
  matchOptions,
  parseMatchJson,
  runMatchOperation,
} from "@/app/lib/match.http";

export const OPTIONS = matchOptions;

/** Match admin lists invitations. */
export async function GET(request: Request, context: MatchRouteContext) {
  const matchId = await matchIdFromContext(request, context);
  if (!matchId) return badMatchRequest(request, "Invalid match id");
  return runMatchOperation(request, async ({ userId, service }) => ({
    invitations: await service.listInvitations(userId, matchId),
  }));
}

/** Match admin invites or re-invites one user while PLANNING. */
export async function POST(request: Request, context: MatchRouteContext) {
  const matchId = await matchIdFromContext(request, context);
  if (!matchId) return badMatchRequest(request, "Invalid match id");
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = inviteMatchUserSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request, "Invalid request body");
  return runMatchOperation(
    request,
    async ({ userId, service }) => ({
      invitation: await service.invite(userId, matchId, parsed.data.inviteeUserId),
    }),
    201,
  );
}
