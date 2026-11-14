import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { groupInviteesQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
type Context = { params: Promise<{ groupId: string }> };
export function GET(request: Request, context: Context) {
  return runRecordOperation(request, async (userId, { groups }) =>
    groups.invitationCandidates(
      userId,
      communityId((await context.params).groupId),
      recordQuery(request, groupInviteesQuery),
    ),
  );
}
