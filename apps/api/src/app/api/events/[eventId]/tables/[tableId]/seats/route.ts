import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { eventSeatsQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runRecordOperation(request, async (userId, { events }) => {
    const { eventId, tableId } = await context.params,
      { pending, ...page } = recordQuery(request, eventSeatsQuery);
    return events.seats(userId, communityId(eventId), communityId(tableId), page, pending);
  });
}
