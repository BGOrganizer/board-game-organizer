import { createPlannedEventSchema } from "@board-game-organizer/schemas";
import { communityBody, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, eventListQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(request: Request) {
  return runRecordOperation(request, (userId, { events }) => {
    const { groupId, ...page } = recordQuery(request, eventListQuery);
    return events.list(userId, page, groupId);
  });
}
export function POST(request: Request) {
  return runRecordOperation(
    request,
    async (userId, { events }) => {
      recordQuery(request, emptyRecordQuery);
      return events.create(userId, await communityBody(request, createPlannedEventSchema));
    },
    201,
  );
}
