import type { User } from "@board-game-organizer/schemas";
import { claimInviteParamsSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb, withTransaction } from "@/app/lib/db";
import { InvitesRepository } from "@/app/lib/invites.repository";
import { RelationshipRepository } from "@/app/lib/relationship.repository";

/**
 * POST /api/invites/claim — claim an invite link by token.
 *
 * Validates the token (pending + not expired), marks it claimed, then
 * connects claimer ↔ inviter as MUTUAL followers/friends (bidirectional), so
 * the claimed user finds the inviter among their friends/following.
 */
/** CORS preflight. */
export function OPTIONS() {
  return corsOptions();
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  const body = await request.json().catch(() => null);
  const parsed = claimInviteParamsSchema.safeParse(body ?? {});
  if (!parsed.success) return corsJson({ error: "Invalid body" }, { status: 400 }, request);

  const { token } = parsed.data;
  const db = await getDb();

  const invite = await new InvitesRepository(db).findByToken(token);
  if (!invite) return corsJson({ error: "Invite not found" }, { status: 404 }, request);
  if (invite.inviterUserId === userId) {
    return corsJson({ error: "You cannot claim your own invite" }, { status: 400 }, request);
  }
  if (invite.status !== "pending") {
    return corsJson({ error: "Invite already claimed" }, { status: 409 }, request);
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return corsJson({ error: "Invite expired" }, { status: 410 }, request);
  }

  // Mutual connection: both become followers AND friends (the claimed user
  // finds the inviter in Friends/Following).
  const result = await withTransaction(async (session, tdb) => {
    const claimed = await new InvitesRepository(tdb, session).claim(token, userId);
    if (!claimed) {
      // Lost the race (claimed/expired between check and claim).
      return { claimed: false };
    }
    await new RelationshipRepository(tdb, session).becomeFriends(userId, invite.inviterUserId);
    return { claimed: true };
  });

  if (!result.claimed) {
    return corsJson({ error: "Invite already claimed" }, { status: 409 }, request);
  }

  const inviter = await db
    .collection<User>(COLLECTIONS.USERS)
    .findOne(
      { clerkId: invite.inviterUserId },
      { projection: { _id: 0, clerkId: 1, name: 1, email: 1, avatarUrl: 1 } },
    );
  return corsJson(
    {
      success: true,
      inviter: inviter
        ? {
            id: inviter.clerkId,
            name: inviter.name,
            email: inviter.email,
            avatarUrl: inviter.avatarUrl ?? null,
          }
        : null,
    },
    request,
  );
}
