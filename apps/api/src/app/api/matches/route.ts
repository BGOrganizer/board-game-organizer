import { createMatchSchema } from "@board-game-organizer/schemas";
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
  if (!hasValidMatchQuery(request)) return badMatchRequest(request, "Invalid query");
  return runMatchOperation(request, async ({ userId, service }) => ({
    matches: await service.list(userId),
  }));
}
