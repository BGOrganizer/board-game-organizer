import { createInviteParamsSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { InvitesRepository } from "@/app/lib/invites.repository";

/**
 * POST /api/invites — create a shareable invite link. The link points at
 * THIS API (the origin that received the request), so preview deployments
 * generate preview links and production generates production links.
 */
/** CORS preflight (missing = browsers reject the POST → invites silently fail). */
export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  const body = await request.json().catch(() => null);
  const parsed = createInviteParamsSchema.safeParse(body ?? {});
  if (!parsed.success) return corsJson({ error: "Invalid body" }, { status: 400 }, request);

  const db = await getDb();
  const invite = await new InvitesRepository(db).create(userId, parsed.data.email);
  // The link points at THIS API (the origin that received the request):
  // preview API → preview invite page, production API → production page.
  const origin = new URL(request.url).origin;
  const link = `${origin}/invite/${invite.token}`;
  return corsJson(
    {
      token: invite.token,
      link,
      email: invite.email ?? null,
      expiresAt: invite.expiresAt.toISOString(),
    },
    { status: 201 },
    request,
  );
}
