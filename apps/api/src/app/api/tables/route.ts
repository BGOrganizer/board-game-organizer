import { runRecordOperation } from "@/app/lib/community/record-http";
import { eventListQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(request: Request) {
  return runRecordOperation(request, (userId, { events }) => {
    return events.personalTables(
      userId,
      recordQuery(request, eventListQuery.omit({ groupId: true })),
    );
  });
}
