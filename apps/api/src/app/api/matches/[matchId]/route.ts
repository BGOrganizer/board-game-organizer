import { type MatchDetailResponse, updateMatchSchema } from "@board-game-organizer/schemas";
import { gameThumbnail, hydrateGames } from "@/app/lib/bgg";
import { corsJson } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
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
  const response = await runMatchOperation(request, async ({ userId, service }) =>
    service.detail(userId, matchId),
  );
  if (!response.ok) return response;
  const detail = (await response.json()) as MatchDetailResponse;
  // Fetch BGG covers only after access checks and the Mongo transaction complete.
  await hydrateGames(await getDb(), detail.games);
  return corsJson(
    {
      ...detail,
      games: detail.games.map((game) => ({
        ...game,
        thumbnail: gameThumbnail(game.thumbnail),
      })),
    },
    {},
    request,
  );
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
