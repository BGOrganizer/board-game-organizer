import { updateGroupSchema } from "@board-game-organizer/schemas";
import { z } from "zod";
import { runGroupOperation } from "@/app/lib/group.http";
import {
  badMatchRequest,
  hasValidMatchQuery,
  matchOptions,
  parseMatchJson,
} from "@/app/lib/match.http";

export const OPTIONS = matchOptions;
type Context = { params: Promise<{ groupId: string }> };

async function idFromContext(request: Request, context: Context) {
  if (!hasValidMatchQuery(request)) return null;
  const id = z.uuid().safeParse((await context.params).groupId);
  return id.success ? id.data : null;
}

export async function GET(request: Request, context: Context) {
  const id = await idFromContext(request, context);
  if (!id) return badMatchRequest(request, "Invalid group id");
  return runGroupOperation(request, async (userId, service) => ({
    group: await service.detail(userId, id),
  }));
}

export async function PATCH(request: Request, context: Context) {
  const id = await idFromContext(request, context);
  if (!id) return badMatchRequest(request, "Invalid group id");
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = updateGroupSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request, "Invalid request body");
  return runGroupOperation(request, async (userId, service) => ({
    group: await service.update(userId, id, parsed.data),
  }));
}

export async function DELETE(request: Request, context: Context) {
  const id = await idFromContext(request, context);
  if (!id) return badMatchRequest(request, "Invalid group id");
  return runGroupOperation(request, async (userId, service) => service.archive(userId, id));
}
