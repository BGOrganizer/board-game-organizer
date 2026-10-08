import { inviteEventPlayerSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";
export const OPTIONS = corsPreflight;
export function POST(
  request: Request,
  context: { params: Promise<{ eventId: string; tableId: string }> },
) {
  return runCommunityOperation(
    request,
    async (userId, _organizations, service) => {
      const params = await context.params;
      return service.book(
        userId,
        communityId(params.eventId),
        communityId(params.tableId),
        (await communityBody(request, inviteEventPlayerSchema)).userId,
      );
    },
    201,
  );
}
