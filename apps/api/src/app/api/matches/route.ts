import { createMatchSchema } from "@board-game-organizer/schemas";
import { pageNamedList, parseListQuery } from "@/app/lib/list-pagination";
import {
  badMatchRequest,
  hasValidMatchQuery,
  matchOptions,
  parseMatchJson,
  runMatchOperation,
} from "@/app/lib/match.http";

export const OPTIONS = matchOptions;

/** Create a PLANNING match and its initial invitations atomically. */
export async function POST(request: Request) {
  if (!hasValidMatchQuery(request)) return badMatchRequest(request, "Invalid query");
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = createMatchSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request, "Invalid request body");
  return runMatchOperation(
    request,
    async ({ userId, service }) => ({ match: await service.create(userId, parsed.data) }),
    201,
  );
}

/** List matches created by or inviting the caller, newest first. */
export function GET(request: Request) {
  const options = parseListQuery(request);
  if (!options) return badMatchRequest(request, "Invalid query");
  return runMatchOperation(request, async ({ userId, service }) => {
    const matches = await service.list(userId);
    const page = pageNamedList(matches, options, (match) => {
      if (match.adminUserId === userId) return "admin";
      const invitation = match.invitations.find((item) => item.inviteeUserId === userId);
      return invitation?.status === "PENDING"
        ? "invited"
        : invitation?.status === "ACCEPTED"
          ? "accepted"
          : null;
    });
    return { matches: page.items, ...(options.limit ? { nextCursor: page.nextCursor } : {}) };
  });
}
