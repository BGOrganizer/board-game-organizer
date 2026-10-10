import { updateEventSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";

type Context = { params: Promise<{ eventId: string }> };
export const OPTIONS = corsPreflight;
export function GET(request: Request, context: Context) {
  return runCommunityOperation(request, async (userId, _organizations, service) =>
    service.detail(userId, communityId((await context.params).eventId)),
  );
}
export function PATCH(request: Request, context: Context) {
  return runCommunityOperation(request, async (userId, _organizations, service) =>
    service.update(
      userId,
      communityId((await context.params).eventId),
      await communityBody(request, updateEventSchema),
    ),
  );
}
export function DELETE(request: Request, context: Context) {
  return runCommunityOperation(request, async (userId, _organizations, service) =>
    service.cancel(userId, communityId((await context.params).eventId)),
  );
}
