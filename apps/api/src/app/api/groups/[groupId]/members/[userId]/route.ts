import { decideGroupMembershipSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { communityUserId } from "@/app/lib/community/request";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string; userId: string }> },
) {
  return runRecordOperation(request, async (actor, { groups }) => {
    recordQuery(request, emptyRecordQuery);
    const { groupId, userId } = await context.params;
    return groups.membershipAction(
      actor,
      communityId(groupId),
      communityUserId(userId),
      await communityBody(request, decideGroupMembershipSchema),
    );
  });
}
