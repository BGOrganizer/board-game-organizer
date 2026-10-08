import { saveEventSchema } from "@board-game-organizer/schemas";
import {
  communityBody,
  communityId,
  communityPage,
  runCommunityOperation,
} from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";
import { eventListPeriods } from "@/app/lib/events/event-list-filter";

type Context = { params: Promise<{ organizationId: string }> };
export const OPTIONS = corsPreflight;
export function GET(request: Request, context: Context) {
  return runCommunityOperation(request, async (userId, _organizations, service) =>
    service.list(
      userId,
      communityPage(request),
      communityId((await context.params).organizationId),
      eventListPeriods(request),
    ),
  );
}
export function POST(request: Request, context: Context) {
  return runCommunityOperation(
    request,
    async (userId, _organizations, service) =>
      service.create(
        userId,
        communityId((await context.params).organizationId),
        await communityBody(request, saveEventSchema),
      ),
    201,
  );
}
