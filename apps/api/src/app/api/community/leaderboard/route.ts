import { leaderboardQuerySchema } from "@board-game-organizer/schemas";
import { runRecordOperation } from "@/app/lib/community/record-http";
import { recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";

export const OPTIONS = corsOptions;

export function GET(request: Request) {
  return runRecordOperation(request, (actor, { globalLeaderboard }) =>
    globalLeaderboard(actor, recordQuery(request, leaderboardQuerySchema)),
  );
}
