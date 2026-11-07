import { deletePlannedRecordSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    const { eventId, tableId } = await context.params;
    return events.removeTable(
      userId,
      communityId(eventId),
      communityId(tableId),
      await communityBody(request, deletePlannedRecordSchema),
    );
  });
}
export function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    const { eventId, tableId } = await context.params;
    return events.tableDetail(userId, communityId(eventId), communityId(tableId));
  });
}
