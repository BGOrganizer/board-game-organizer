import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { eventParticipantsQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return runRecordOperation(request, async (actor, { events }) =>
    events.participants(
      actor,
      communityId((await context.params).eventId),
      recordQuery(request, eventParticipantsQuery),
    ),
  );
}
