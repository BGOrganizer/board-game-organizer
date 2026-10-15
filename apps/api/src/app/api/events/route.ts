import { communityPage, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";
import { eventListPeriods } from "@/app/lib/events/event-list-filter";
export const OPTIONS = corsPreflight;
export function GET(request: Request) {
  return runCommunityOperation(request, (userId, _organizations, service) =>
    service.list(userId, communityPage(request), undefined, eventListPeriods(request)),
  );
}
