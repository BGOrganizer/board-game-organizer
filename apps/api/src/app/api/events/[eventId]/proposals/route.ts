import { submitEventProposalSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import {
  emptyRecordQuery,
  eventProposalsQuery,
  recordQuery,
} from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return runRecordOperation(request, async (actor, { events }) =>
    events.proposals(
      actor,
      communityId((await context.params).eventId),
      recordQuery(request, eventProposalsQuery),
    ),
  );
}
export function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return runRecordOperation(
    request,
    async (actor, { events }) => {
      recordQuery(request, emptyRecordQuery);
      return events.submitProposal(
        actor,
        communityId((await context.params).eventId),
        await communityBody(request, submitEventProposalSchema),
      );
    },
    201,
  );
}
