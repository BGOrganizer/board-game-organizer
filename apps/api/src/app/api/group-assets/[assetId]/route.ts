import { uploadGroupLogoChunkSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
type Context = { params: Promise<{ assetId: string }> };
export function GET(request: Request, context: Context) {
  return runRecordOperation(
    request,
    async (userId, { assets }) => {
      recordQuery(request, emptyRecordQuery);
      return assets.preview(userId, communityId((await context.params).assetId));
    },
    200,
    "group.logo.preview",
  );
}
export function PATCH(request: Request, context: Context) {
  return runRecordOperation(
    request,
    async (userId, { assets }) => {
      recordQuery(request, emptyRecordQuery);
      return assets.append(
        userId,
        communityId((await context.params).assetId),
        await communityBody(request, uploadGroupLogoChunkSchema),
      );
    },
    200,
    "group.logo.chunk",
  );
}
