import { inviteTablePlayerSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runRecordOperation(
    request,
    async (userId, { events }) => {
      recordQuery(request, emptyRecordQuery);
      const { eventId, tableId } = await context.params,
        { userId: target } = await communityBody(request, inviteTablePlayerSchema);
      return events.register(userId, communityId(eventId), communityId(tableId), target);
    },
    201,
  );
}
