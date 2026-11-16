import { developmentInviteWebTarget } from "@board-game-organizer/shared";
import { developmentInvitePublication } from "../../../lib/invites/development-invite-publication";
export const dynamic = "force-dynamic";
/** Public navigation only; claims stay on the configured Development API. */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const url = new URL(request.url);
  const targets = url.searchParams.getAll("web");
  const target = targets.length === 1 ? developmentInviteWebTarget(token, targets[0]) : null;
  if (!target)
    return Response.json(
      { error: "INVALID_INVITE_LINK" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  const publication = await developmentInvitePublication(new URL(target).origin);
  if (publication !== "eligible")
    return Response.json(
      { error: "INVITE_DESTINATION_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
