import { decideTableRegistrationSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function PATCH(request: Request, context: { params: Promise<{ registrationId: string }> }) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    return events.registrationAction(
      userId,
      communityId((await context.params).registrationId),
      await communityBody(request, decideTableRegistrationSchema),
    );
  });
}
