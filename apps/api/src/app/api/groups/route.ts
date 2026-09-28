import { createGroupSchema } from "@board-game-organizer/schemas";
import { runGroupOperation } from "@/app/lib/group.http";
import {
  badMatchRequest,
  hasValidMatchQuery,
  matchOptions,
  parseMatchJson,
} from "@/app/lib/match.http";

export const OPTIONS = matchOptions;

export function GET(request: Request) {
  if (!hasValidMatchQuery(request)) return badMatchRequest(request, "Invalid query");
  return runGroupOperation(request, async (userId, service) => ({
    groups: await service.list(userId),
  }));
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
