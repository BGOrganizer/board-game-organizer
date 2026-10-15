import { createGroupSchema } from "@board-game-organizer/schemas";
import { runGroupOperation } from "@/app/lib/groups/group.http";
import { pageNamedList, parseListQuery } from "@/app/lib/list-pagination";
import {
  badMatchRequest,
  hasValidMatchQuery,
  matchOptions,
  parseMatchJson,
} from "@/app/lib/matches/match.http";

export const OPTIONS = matchOptions;

export function GET(request: Request) {
  const options = parseListQuery(request);
  if (!options) return badMatchRequest(request, "Invalid query");
  return runGroupOperation(request, async (userId, service) => {
    const groups = await service.list(userId);
    const page = pageNamedList(groups, options, (group) => {
      if (group.adminUserId === userId) return "admin";
      const invitation = group.invitations.find((item) => item.inviteeUserId === userId);
      return invitation?.status === "PENDING"
        ? "invited"
        : invitation?.status === "ACCEPTED"
          ? "accepted"
          : null;
    });
    return { groups: page.items, ...(options.limit ? { nextCursor: page.nextCursor } : {}) };
  });
}

export async function POST(request: Request) {
  if (!hasValidMatchQuery(request)) return badMatchRequest(request, "Invalid query");
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = createGroupSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request, "Invalid request body");
  return runGroupOperation(
    request,
    async (userId, service) => ({ group: await service.create(userId, parsed.data) }),
    201,
  );
}
