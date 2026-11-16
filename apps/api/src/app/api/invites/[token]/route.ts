import { claimInviteParamsSchema } from "@board-game-organizer/schemas";
import { runRecordOperation } from "@/app/lib/community/record-http";
import { CommunityError } from "@/app/lib/community.error";
import { corsOptions } from "@/app/lib/cors";

export const OPTIONS = corsOptions;
/** Restricted authenticated preview; possession alone grants no Group/Event/Table access. */
export function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  return runRecordOperation(request, async (userId, { invites }) => {
    const parsed = claimInviteParamsSchema.pick({ token: true }).safeParse(await context.params);
    if (!parsed.success) throw new CommunityError(400, "INVALID_INVITE_TOKEN");
    return invites.review(userId, parsed.data.token);
  });
}
