import { deletePlannedRecordSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { communityUserId } from "@/app/lib/community/request";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string; userId: string }> },
) {
  return runRecordOperation(request, async (actor, { events }) => {
    recordQuery(request, emptyRecordQuery);
    const { eventId, userId } = await context.params;
    return events.removeParticipant(
      actor,
      communityId(eventId),
      communityUserId(userId),
      await communityBody(request, deletePlannedRecordSchema),
    );
  });
}
