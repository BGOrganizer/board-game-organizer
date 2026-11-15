import { createGroupRecordSchema } from "@board-game-organizer/schemas";
import { communityBody, runRecordOperation } from "@/app/lib/community/record-http";
import { emptyRecordQuery, groupListQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(request: Request) {
  return runRecordOperation(request, (userId, { groups }) => {
    const { scope, ...page } = recordQuery(request, groupListQuery);
    return groups.list(userId, scope, page);
  });
}
export function POST(request: Request) {
  return runRecordOperation(
    request,
    async (userId, { groups }) => {
      recordQuery(request, emptyRecordQuery);
      return groups.save(userId, await communityBody(request, createGroupRecordSchema));
    },
    201,
    "group.create",
  );
}
