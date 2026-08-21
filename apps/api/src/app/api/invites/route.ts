import { createInviteParamsSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { InvitesRepository } from "@/app/lib/invites.repository";

/**
 * GET /api/invites — the viewer's invites (newest first).
 * POST /api/invites — create a shareable invite link (optional target email
 * enables auto-claim on email match).
 */
/** CORS preflight. */
export function OPTIONS() {
  return corsOptions();
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const invites = await new InvitesRepository(db).listByInviter(userId);
  return corsJson({
    invites: invites.map((i) => ({
      token: i.token,
      link: `${getWebOrigin()}/invite/${i.token}`,
      email: i.email ?? null,
      status: i.status,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
      claimedAt: i.claimedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createInviteParamsSchema.safeParse(body ?? {});
  if (!parsed.success) return corsJson({ error: "Invalid body" }, { status: 400 });

  const db = await getDb();
  const invite = await new InvitesRepository(db).create(userId, parsed.data.email);
  // The link points at the origin that GENERATED the invite (preview vs
  // production web), falling back to the configured WEB_ORIGIN.
  const link = `${parsed.data.webOrigin ?? getWebOrigin()}/invite/${invite.token}`;
  return corsJson(
    {
      token: invite.token,
      link,
      email: invite.email ?? null,
      expiresAt: invite.expiresAt.toISOString(),
    },
    { status: 201 },
  );
}

/** Web origin for shareable links (configurable, defaults to the API host). */
function getWebOrigin(): string {
  return process.env.WEB_ORIGIN?.replace(/\/$/, "") || "https://web-rosy-phi-82.vercel.app";
}
