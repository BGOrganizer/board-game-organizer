import { tableSeatOrderSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
type Context = { params: Promise<{ eventId: string; tableId: string }> };
export function GET(request: Request, context: Context) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    const p = await context.params;
    return events.seatOrderSnapshot(userId, communityId(p.eventId), communityId(p.tableId));
  });
}
export function PATCH(request: Request, context: Context) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    const p = await context.params;
    return events.reorderSeats(
      userId,
      communityId(p.eventId),
      communityId(p.tableId),
      await communityBody(request, tableSeatOrderSchema),
    );
  });
}
