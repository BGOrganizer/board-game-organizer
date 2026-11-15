import { reviewEventProposalSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; proposalId: string }> },
) {
  return runRecordOperation(request, async (actor, { events }) => {
    recordQuery(request, emptyRecordQuery);
    const { eventId, proposalId } = await context.params;
    return events.proposalDetail(actor, communityId(eventId), communityId(proposalId));
  });
}
export function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; proposalId: string }> },
) {
  return runRecordOperation(request, async (actor, { events }) => {
    recordQuery(request, emptyRecordQuery);
    const { eventId, proposalId } = await context.params;
    return events.reviewProposal(
      actor,
      communityId(eventId),
      communityId(proposalId),
      await communityBody(request, reviewEventProposalSchema),
    );
  });
}
