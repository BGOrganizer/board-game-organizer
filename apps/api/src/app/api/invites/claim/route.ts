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
 * connects claimer ↔ inviter:
 * - invite carries an email that matches the claimer → they become friends
 * - otherwise → the claimer follows the inviter
 */
/** CORS preflight. */
export function OPTIONS() {
  return corsOptions();
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = claimInviteParamsSchema.safeParse(body ?? {});
  if (!parsed.success) return corsJson({ error: "Invalid body" }, { status: 400 });

  const { token } = parsed.data;
  const db = await getDb();

  const invite = await new InvitesRepository(db).findByToken(token);
  if (!invite) return corsJson({ error: "Invite not found" }, { status: 404 });
  if (invite.inviterUserId === userId) {
    return corsJson({ error: "You cannot claim your own invite" }, { status: 400 });
  }
  if (invite.status !== "pending") {
    return corsJson({ error: "Invite already claimed" }, { status: 409 });
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return corsJson({ error: "Invite expired" }, { status: 410 });
  }

  // Email match → auto-accept as friends; otherwise → follow the inviter.
  const me = await db
    .collection<User>(COLLECTIONS.USERS)
    .findOne({ clerkId: userId }, { projection: { email: 1 } });
  const emailMatches = Boolean(invite.email && me?.email && invite.email === me.email);

  const result = await withTransaction(async (session, tdb) => {
    const claimed = await new InvitesRepository(tdb, session).claim(token, userId);
    if (!claimed) {
      // Lost the race (claimed/expired between check and claim).
      return { claimed: false };
    }
    const repo = new RelationshipRepository(tdb, session);
    if (emailMatches) {
      await repo.becomeFriends(userId, invite.inviterUserId);
    } else {
      await repo.upsert(userId, invite.inviterUserId, "follow", "accepted");
    }
    return { claimed: true };
  });

  if (!result.claimed) {
    return corsJson({ error: "Invite already claimed" }, { status: 409 });
  }

  const inviter = await db
    .collection<User>(COLLECTIONS.USERS)
    .findOne(
      { clerkId: invite.inviterUserId },
      { projection: { _id: 0, clerkId: 1, name: 1, email: 1, avatarUrl: 1 } },
    );
  return corsJson({
    success: true,
    autoAccepted: emailMatches,
    inviter: inviter
      ? {
          id: inviter.clerkId,
          name: inviter.name,
          email: inviter.email,
          avatarUrl: inviter.avatarUrl ?? null,
        }
      : null,
  });
}
