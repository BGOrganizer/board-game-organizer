import { startGroupLogoSchema } from "@board-game-organizer/schemas";
import { communityBody, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function POST(request: Request) {
  return runRecordOperation(
    request,
    async (userId, { assets }) => {
      recordQuery(request, emptyRecordQuery);
      return assets.start(userId, await communityBody(request, startGroupLogoSchema));
    },
    201,
  );
}
