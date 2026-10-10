import { organizationEmptyActionSchema } from "@board-game-organizer/schemas";
import {
  communityBody,
  communityId,
  communityPage,
  runCommunityOperation,
} from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";

type Context = { params: Promise<{ eventId: string; tableId: string }> };
export const OPTIONS = corsPreflight;
export function GET(request: Request, context: Context) {
  return runCommunityOperation(request, async (userId, _organizations, service) => {
    const params = await context.params;
    return service.bookings(
      userId,
      communityId(params.eventId),
      communityId(params.tableId),
      communityPage(request),
    );
  });
}
export function POST(request: Request, context: Context) {
  return runCommunityOperation(
    request,
    async (userId, _organizations, service) => {
      await communityBody(request, organizationEmptyActionSchema);
      const params = await context.params;
      return service.book(userId, communityId(params.eventId), communityId(params.tableId));
    },
    201,
  );
}
