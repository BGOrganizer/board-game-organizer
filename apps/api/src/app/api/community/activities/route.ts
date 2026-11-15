import { communityActivityQuerySchema } from "@board-game-organizer/schemas";
import { recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
import { profileRead } from "@/app/lib/profile/profile.http";
export const OPTIONS = corsOptions;
export async function GET(request: Request) {
  return profileRead(request, undefined, (viewer, _subject, service) =>
    service.networkFeed(viewer, recordQuery(request, communityActivityQuerySchema)),
  );
}
