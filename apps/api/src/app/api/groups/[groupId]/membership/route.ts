import { z } from "zod";
import { runGroupOperation } from "@/app/lib/groups/group.http";
import { badMatchRequest, hasValidMatchQuery, matchOptions } from "@/app/lib/matches/match.http";

export const OPTIONS = matchOptions;

/** An accepted member can leave; admin remains until archiving the group. */
export async function DELETE(request: Request, context: { params: Promise<{ groupId: string }> }) {
  const parsed = z.uuid().safeParse((await context.params).groupId);
  if (!hasValidMatchQuery(request) || !parsed.success)
    return badMatchRequest(request, "Invalid group id");
  return runGroupOperation(request, async (userId, service) => service.leave(userId, parsed.data));
}
