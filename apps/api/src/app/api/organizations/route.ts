import { organizationListRolesSchema, saveOrganizationSchema } from "@board-game-organizer/schemas";
import { z } from "zod";
import { CommunityError } from "@/app/lib/community.error";
import { communityBody, communityPage, runCommunityOperation } from "@/app/lib/community.http";
import { corsOptions as corsPreflight } from "@/app/lib/cors";
export const OPTIONS = corsPreflight;
export function GET(request: Request) {
  return runCommunityOperation(request, (userId, service) => {
    const scope = z
      .enum(["mine", "public", "moderation"])
      .safeParse(new URL(request.url).searchParams.get("scope") ?? "mine");
    if (!scope.success) throw new CommunityError(400, "INVALID_SCOPE");
    const roles = organizationListRolesSchema.safeParse(
      new URL(request.url).searchParams.get("roles") ?? undefined,
    );
    if (!roles.success) throw new CommunityError(400, "INVALID_ROLES");
    return service.list(userId, scope.data, communityPage(request), roles.data);
  });
}
export function POST(request: Request) {
  return runCommunityOperation(
    request,
    async (userId, service) =>
      service.save(userId, await communityBody(request, saveOrganizationSchema)),
    201,
  );
}
