import { profileHistoryQuerySchema } from "@board-game-organizer/schemas";
import { z } from "zod";
import { recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
import { profileRead } from "@/app/lib/profile/profile.http";
export const OPTIONS = corsOptions;
export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string; gameId: string }> },
) {
  const { userId, gameId } = await context.params;
  return profileRead(request, userId, (viewer, subject, service) => {
    const game = z.coerce.number().int().positive().parse(gameId);
    const query = recordQuery(request, profileHistoryQuerySchema);
    return service.history(viewer, subject, game, query.cursor);
  });
}
