import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { recordQuery, tableLeaderboardQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runRecordOperation(request, async (userId, { events }) => {
    const { eventId, tableId } = await context.params;
    return events.tableLeaderboard(
      userId,
      communityId(eventId),
      communityId(tableId),
      recordQuery(request, tableLeaderboardQuery),
    );
  });
}
