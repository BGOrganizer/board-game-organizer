import { z } from "zod";
import {
  badMatchRequest,
  type MatchRouteContext,
  matchIdFromContext,
  matchOptions,
  parseMatchJson,
  runMatchOperation,
} from "@/app/lib/matches/match.http";

export const OPTIONS = matchOptions;

/** Reserve one planning slot with an admin-reviewed request. No public discovery. */
export async function POST(request: Request, context: MatchRouteContext) {
  const matchId = await matchIdFromContext(request, context);
  if (!matchId) return badMatchRequest(request);
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  if (!z.object({}).strict().safeParse(body.data).success) return badMatchRequest(request);
  return runMatchOperation(
    request,
    async ({ service, userId }) => ({
      invitation: await service.requestJoin(userId, matchId),
    }),
    201,
  );
}
