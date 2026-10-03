import { setMatchChoiceSchema } from "@board-game-organizer/schemas";
import {
  badMatchRequest,
  type MatchRouteContext,
  matchIdFromContext,
  matchOptions,
  parseMatchJson,
  runMatchOperation,
} from "@/app/lib/match.http";

export const OPTIONS = matchOptions;

export async function PATCH(request: Request, context: MatchRouteContext) {
  const matchId = await matchIdFromContext(request, context);
  if (!matchId) return badMatchRequest(request, "Invalid match id");
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = setMatchChoiceSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request, "Invalid request body");
  return runMatchOperation(request, async ({ userId, service }) => {
    await service.setChoice(userId, matchId, parsed.data);
    return { success: true };
  });
}
