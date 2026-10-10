import { communityPage } from "@/app/lib/community.http";
import { runGroupOperation } from "@/app/lib/groups/group.http";
import { badMatchRequest, matchOptions } from "@/app/lib/matches/match.http";
export const OPTIONS = matchOptions;
export function GET(request: Request) {
  let page: ReturnType<typeof communityPage>;
  try {
    page = communityPage(request);
  } catch {
    return badMatchRequest(request, "Invalid query");
  }
  if (!page.query) return badMatchRequest(request, "Search requires at least four characters");
  return runGroupOperation(request, (_userId, service) => service.discover(page));
}
