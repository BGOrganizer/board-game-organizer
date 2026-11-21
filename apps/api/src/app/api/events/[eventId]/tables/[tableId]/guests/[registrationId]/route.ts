import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";

export const OPTIONS = corsOptions;

export function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string; registrationId: string }> },
) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    const { eventId, tableId, registrationId } = await context.params;
    return events.guestVotes(
      userId,
      communityId(eventId),
      communityId(tableId),
      communityId(registrationId),
    );
  });
}
