import { inviteOrganizationMemberSchema } from "@board-game-organizer/schemas";
import { z } from "zod";
import { CommunityError } from "@/app/lib/community.error";
import {
  communityBody,
  communityId,
  communityPage,
  runCommunityOperation,
} from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";

type Context = { params: Promise<{ organizationId: string }> };
export const OPTIONS = corsPreflight;
export function GET(request: Request, context: Context) {
  return runCommunityOperation(request, async (userId, service) => {
    const mode = z
      .enum(["accepted", "pending", "excluded"])
      .safeParse(new URL(request.url).searchParams.get("mode") ?? "accepted");
    if (!mode.success) throw new CommunityError(400, "INVALID_SCOPE");
    return service.members(
      userId,
      communityId((await context.params).organizationId),
      communityPage(request),
      mode.data,
    );
  });
}
export function POST(request: Request, context: Context) {
  return runCommunityOperation(
    request,
    async (userId, service) =>
      service.invite(
        userId,
        communityId((await context.params).organizationId),
        (await communityBody(request, inviteOrganizationMemberSchema)).userId,
      ),
    201,
  );
}
