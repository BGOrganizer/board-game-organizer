import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
/** Public membership requests are always attributed to the authenticated actor. */
export function POST(request: Request, context: { params: Promise<{ groupId: string }> }) {
  return runRecordOperation(
    request,
    async (userId, { groups }) => {
      recordQuery(request, emptyRecordQuery);
      return groups.request(userId, communityId((await context.params).groupId));
    },
    201,
  );
}
