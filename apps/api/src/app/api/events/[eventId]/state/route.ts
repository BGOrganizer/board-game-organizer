import { changeEventStateSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    return events.transition(
      userId,
      communityId((await context.params).eventId),
      await communityBody(request, changeEventStateSchema),
    );
  });
}
