import { leaderboardQuerySchema } from "@board-game-organizer/schemas";
import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(request: Request, context: { params: Promise<{ groupId: string }> }) {
  return runRecordOperation(request, async (actor, { groups }) =>
    groups.rankings(
      actor,
      communityId((await context.params).groupId),
      recordQuery(request, leaderboardQuerySchema),
    ),
  );
}
