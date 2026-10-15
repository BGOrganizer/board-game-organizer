import { communityId, communityPage, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";
export const OPTIONS = corsPreflight;
export function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return runCommunityOperation(request, async (userId, _organizations, service) =>
    service.tables(userId, communityId((await context.params).eventId), communityPage(request)),
  );
}
