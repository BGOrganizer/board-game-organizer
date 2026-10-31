import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { eventTablesQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
/** Table edits belong to the atomic event update, never a separate partial writer. */
export function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return runRecordOperation(request, async (userId, { events }) =>
    events.tables(
      userId,
      communityId((await context.params).eventId),
      recordQuery(request, eventTablesQuery),
    ),
  );
}
