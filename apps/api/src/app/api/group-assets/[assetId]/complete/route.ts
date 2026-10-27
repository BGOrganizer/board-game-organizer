import { communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function POST(request: Request, context: { params: Promise<{ assetId: string }> }) {
  return runRecordOperation(
    request,
    async (userId, { assets }) => {
      recordQuery(request, emptyRecordQuery);
      return assets.complete(userId, communityId((await context.params).assetId));
    },
    200,
    "group.logo.complete",
  );
}
