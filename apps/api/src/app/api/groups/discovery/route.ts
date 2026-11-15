import { runRecordOperation } from "@/app/lib/community/record-http";
import { recordPageQuery, recordQuery } from "@/app/lib/community/record-query";
import { CommunityError } from "@/app/lib/community.error";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(request: Request) {
  return runRecordOperation(request, (userId, { groups }) => {
    const page = recordQuery(request, recordPageQuery);
    if (!page.query) throw new CommunityError(400, "SEARCH_REQUIRED");
    return groups.list(userId, "public", page);
  });
}
