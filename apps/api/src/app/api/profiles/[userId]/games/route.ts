import { profileGameQuerySchema } from "@board-game-organizer/schemas";
import { recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
import { profileRead } from "@/app/lib/profile/profile.http";
export const OPTIONS = corsOptions;
export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  return profileRead(request, userId, (viewer, subject, service) => {
    const query = recordQuery(request, profileGameQuerySchema);
    return service.games(viewer, subject, query.cursor, query.query);
  });
}
