import { respondGroupInvitationSchema } from "@board-game-organizer/schemas";
import { z } from "zod";
import { runGroupOperation } from "@/app/lib/group.http";
import {
  badMatchRequest,
  hasValidMatchQuery,
  matchOptions,
  parseMatchJson,
} from "@/app/lib/match.http";

export const OPTIONS = matchOptions;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  const id = z.uuid().safeParse((await context.params).invitationId);
  if (!hasValidMatchQuery(request) || !id.success)
    return badMatchRequest(request, "Invalid invitation id");
  return runGroupOperation(request, (userId, service) => service.removeInvitation(userId, id.data));
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  const id = z.uuid().safeParse((await context.params).invitationId);
  if (!hasValidMatchQuery(request) || !id.success)
    return badMatchRequest(request, "Invalid invitation id");
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = respondGroupInvitationSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request, "Invalid request body");
  return runGroupOperation(request, async (userId, service) => ({
    group: await service.respond(userId, id.data, parsed.data.decision),
  }));
}
