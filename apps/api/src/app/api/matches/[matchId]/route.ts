import { updateMatchSchema } from "@board-game-organizer/schemas";
import {
  badMatchRequest,
  type MatchRouteContext,
  matchIdFromContext,
  matchOptions,
  parseMatchJson,
  runMatchOperation,
} from "@/app/lib/match.http";

export const OPTIONS = matchOptions;

export async function GET(request: Request, context: MatchRouteContext) {
  const matchId = await matchIdFromContext(request, context);
  if (!matchId) return badMatchRequest(request, "Invalid match id");
  return runMatchOperation(request, async ({ userId, service }) => service.detail(userId, matchId));
}

/** Match admin can update match fields while PLANNING. */
export async function PATCH(request: Request, context: MatchRouteContext) {
  const matchId = await matchIdFromContext(request, context);
  if (!matchId) return badMatchRequest(request, "Invalid match id");
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = updateMatchSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request, "Invalid request body");
  return runMatchOperation(request, async ({ userId, service }) => ({
    match: await service.update(userId, matchId, parsed.data),
  }));
}

/** Match admin deletes match and every invitation atomically. */
export async function DELETE(request: Request, context: MatchRouteContext) {
  const matchId = await matchIdFromContext(request, context);
  if (!matchId) return badMatchRequest(request, "Invalid match id");
  return runMatchOperation(request, async ({ userId, service }) => {
    await service.deleteMatch(userId, matchId);
  });
}
