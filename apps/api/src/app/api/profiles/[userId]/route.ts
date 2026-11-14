import { emptyRecordQuery, recordQuery } from "@/app/lib/community/record-query";
import { corsOptions } from "@/app/lib/cors";
import { profileRead } from "@/app/lib/profile/profile.http";
export const OPTIONS = corsOptions;
export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  return profileRead(request, userId, (viewer, subject, service) => {
    recordQuery(request, emptyRecordQuery);
    return service.profile(viewer, subject);
  });
}
