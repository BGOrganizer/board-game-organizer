import type { User } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { getBlockedByUserIds } from "@/app/lib/blocks";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb } from "@/app/lib/db";

/**
 * GET /api/users/suggestions
 *
 * Follow suggestions: users the viewer is NOT already following and has
 * not blocked, preferring users with recent presence. `blockedMe` users are
 * excluded (the blocked user must not see the blocker as a suggestion).
 */
/** CORS preflight. */
export function OPTIONS() {
  return corsOptions();
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const [blockedByMe, blockedMe] = await Promise.all([
    db.collection(COLLECTIONS.BLOCKS).find({ fromUserId: userId }).toArray(),
    getBlockedByUserIds(db, userId),
  ]);
  const blockedIds = new Set([...blockedByMe.map((b) => b.toUserId), ...blockedMe]);

  const following = await db.collection(COLLECTIONS.FOLLOWS).find({ fromUserId: userId }).toArray();
  const followingIds = new Set(following.map((f) => f.toUserId));
  followingIds.add(userId);

  const users = await db
    .collection<User>(COLLECTIONS.USERS)
    .find({}, { projection: { _id: 0 } })
    .sort({ "presence.lastActiveAt": -1 })
    .limit(50)
    .toArray();

  const suggestions = users
    .filter((u) => !followingIds.has(u.clerkId) && !blockedIds.has(u.clerkId))
    .slice(0, 10)
    .map((u) => ({
      id: u.clerkId,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl ?? null,
      presence: u.presence,
    }));

  return corsJson({ users: suggestions, nextCursor: null });
}
