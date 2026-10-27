import { inviteTablePlayerSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import {
  emptyRecordQuery,
  groupInviteesQuery,
  recordQuery,
} from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
/** Authorized, source-paged choices exclude every active registration on this Table. */
export function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runRecordOperation(request, async (userId, { events }) => {
    const page = recordQuery(request, groupInviteesQuery);
    const { eventId, tableId } = await context.params;
    return events.invitationCandidates(userId, communityId(eventId), communityId(tableId), page);
  });
}
export function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runRecordOperation(
    request,
    async (userId, { events }) => {
      recordQuery(request, emptyRecordQuery);
      const { eventId, tableId } = await context.params,
        { userId: target } = await communityBody(request, inviteTablePlayerSchema);
      return events.register(userId, communityId(eventId), communityId(tableId), target);
    },
    201,
  );
}
