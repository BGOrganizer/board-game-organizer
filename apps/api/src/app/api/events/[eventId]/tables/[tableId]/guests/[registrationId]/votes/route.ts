import { changeEventVoteSchema, saveTableGuestVotesSchema } from "@board-game-organizer/schemas";
import { z } from "zod";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";

export const OPTIONS = corsOptions;

const guestVoteSchema = z.union([saveTableGuestVotesSchema, changeEventVoteSchema]);

export function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string; registrationId: string }> },
) {
  return runRecordOperation(request, async (userId, { events }) => {
    recordQuery(request, emptyRecordQuery);
    const { eventId, tableId, registrationId } = await context.params;
    const input = await communityBody(request, guestVoteSchema);
    return events.voteForGuest(
      userId,
      communityId(eventId),
      communityId(tableId),
      communityId(registrationId),
      input,
    );
  });
}
