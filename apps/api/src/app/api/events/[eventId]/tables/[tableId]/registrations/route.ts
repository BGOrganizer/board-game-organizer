import { joinTableSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
/** Explicit voluntary registration; organizer receives no automatic seat. */
export function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runRecordOperation(
    request,
    async (userId, { events }) => {
      recordQuery(request, emptyRecordQuery);
      const { eventId, tableId } = await context.params;
      const input = await communityBody(request, joinTableSchema);
      return events.join(userId, communityId(eventId), communityId(tableId), input);
    },
    201,
  );
}
