import { banGroupUserSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function POST(request: Request, context: { params: Promise<{ groupId: string }> }) {
  return runRecordOperation(
    request,
    async (userId, { groups }) => {
      recordQuery(request, emptyRecordQuery);
      return groups.ban(
        userId,
        communityId((await context.params).groupId),
        await communityBody(request, banGroupUserSchema),
      );
    },
    201,
  );
}
