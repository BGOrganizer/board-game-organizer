import { z } from "zod";
import {
  badMatchRequest,
  idSchema,
  type MatchRouteContext,
  matchOptions,
  runMatchOperation,
} from "@/app/lib/matches/match.http";

const querySchema = z
  .object({
    gameId: z.coerce.number().int().positive(),
    "x-vercel-protection-bypass": z.string().trim().min(1).max(512).optional(),
  })
  .strict();

export const OPTIONS = matchOptions;

export async function GET(request: Request, context: MatchRouteContext) {
  const params = new URL(request.url).searchParams;
  if (["gameId", "x-vercel-protection-bypass"].some((key) => params.getAll(key).length > 1))
    return badMatchRequest(request, "Invalid leaderboard query");
  const query = querySchema.safeParse(Object.fromEntries(params));
  const matchId = idSchema.safeParse((await context.params).matchId);
  if (!query.success || !matchId.success)
    return badMatchRequest(request, "Invalid leaderboard query");
  return runMatchOperation(request, ({ service, userId }) =>
    service.leaderboard(userId, matchId.data, query.data.gameId),
  );
}
