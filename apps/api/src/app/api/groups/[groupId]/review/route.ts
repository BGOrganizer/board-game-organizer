import { decideGroupReviewSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
type Context = { params: Promise<{ groupId: string }> };
export function GET(request: Request, context: Context) {
  return runRecordOperation(request, async (userId, { groups }) => {
    recordQuery(request, emptyRecordQuery);
    return groups.moderationDetail(userId, communityId((await context.params).groupId));
  });
}
export function PATCH(request: Request, context: Context) {
  return runRecordOperation(request, async (userId, { groups }) => {
    recordQuery(request, emptyRecordQuery);
    return groups.review(
      userId,
      communityId((await context.params).groupId),
      await communityBody(request, decideGroupReviewSchema),
    );
  });
}
