import { inviteGroupMemberSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, groupPeopleQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
type Context = { params: Promise<{ groupId: string }> };
export function GET(request: Request, context: Context) {
  return runRecordOperation(request, async (userId, { groups }) => {
    const { mode, ...page } = recordQuery(request, groupPeopleQuery);
    return groups.members(
      userId,
      communityId((await context.params).groupId),
      mode === "bans" ? "banned" : mode,
      page,
    );
  });
}
export function POST(request: Request, context: Context) {
  return runRecordOperation(
    request,
    async (userId, { groups }) => {
      recordQuery(request, emptyRecordQuery);
      const { userId: target } = await communityBody(request, inviteGroupMemberSchema);
      return groups.invite(userId, communityId((await context.params).groupId), target);
    },
    201,
  );
}
