import { communityId, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions } from "@/app/lib/cors";
export const OPTIONS = corsOptions;
export function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runCommunityOperation(request, async (userId, _organizations, events) => {
    const { eventId, tableId } = await context.params;
    return events.tableDetail(userId, communityId(eventId), communityId(tableId));
  });
}
