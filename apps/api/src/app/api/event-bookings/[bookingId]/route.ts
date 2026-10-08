import { eventBookingActionSchema } from "@board-game-organizer/schemas";
import { communityBody, communityId, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";
export const OPTIONS = corsPreflight;
export function PATCH(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  return runCommunityOperation(request, async (userId, _organizations, service) =>
    service.bookingAction(
      userId,
      communityId((await context.params).bookingId),
      (await communityBody(request, eventBookingActionSchema)).action,
    ),
  );
}
