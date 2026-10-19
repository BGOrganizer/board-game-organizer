import { editPlannedEventSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
type Context = { params: Promise<{ eventId: string }> };
export function GET(request: Request, context: Context) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    return events.detail(userId, communityId((await context.params).eventId));
  });
}
export function PATCH(request: Request, context: Context) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    return events.update(
      userId,
      communityId((await context.params).eventId),
      await communityBody(request, editPlannedEventSchema),
    );
  });
}
