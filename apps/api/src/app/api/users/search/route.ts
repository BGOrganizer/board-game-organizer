import type { User } from "@board-game-organizer/schemas";
import { searchContactsParamsSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { getBlockedByUserIds, getBlockedUserIds } from "@/app/lib/blocks";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb } from "@/app/lib/db";
import { pruneRateLimitBuckets, rateLimit } from "@/app/lib/rateLimit";

/** Escape regex metacharacters so user input can't widen the query. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Search rate limit: 20 requests per minute per user (product spec). */
const SEARCH_LIMIT = 20;
const SEARCH_WINDOW_MS = 60_000;

/**
 * GET /api/users/search?query=…
 *
 * Prefix (autocomplete) search over `users` name/email, using an anchored
 * ^$regex (case-insensitive) backed by plain indexes (USER_INDEXES) —
 * cheaper and more predictable than a text index for autocomplete-style
 * queries. Block policy stays asymmetric:
 * - users `viewer` blocked  → excluded
 * - users who blocked `viewer` → findable EXCEPT when they are excluded by
 *   the query results themselves (they stay visible so the blocker
 *   perceives nothing).
 */
/** CORS preflight. */
export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  pruneRateLimitBuckets();
  const limited = rateLimit(`search:${userId}`, SEARCH_LIMIT, SEARCH_WINDOW_MS);
  if (!limited.allowed) {
    return corsJson(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      request,
    );
  }

  const parsed = searchContactsParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return corsJson({ error: "Invalid query" }, { status: 400 }, request);

  const { query } = parsed.data;
  const db = await getDb();
  const [blockedByMe, blockedMe, following, followers, friendPairs] = await Promise.all([
    getBlockedUserIds(db, userId),
    getBlockedByUserIds(db, userId),
    db.collection(COLLECTIONS.FOLLOWS).find({ fromUserId: userId }).toArray(),
    db.collection(COLLECTIONS.FOLLOWS).find({ toUserId: userId }).toArray(),
    db.collection(COLLECTIONS.FRIEND_REQUESTS).find({ status: "accepted" }).toArray(),
  ]);
  const blockedByMeSet = new Set(blockedByMe);
  const blockedMeSet = new Set(blockedMe);
  // Relationship state relative to the viewer: coherent buttons across all
  // contacts sections (search shows Unfollow when already followed).
  const followingSet = new Set(following.map((f) => f.toUserId));
  const followerSet = new Set(followers.map((f) => f.fromUserId));
  const friendSet = new Set(
    friendPairs
      .filter((f) => f.fromUserId === userId || f.toUserId === userId)
      .map((f) => (f.fromUserId === userId ? f.toUserId : f.fromUserId)),
  );

  const users = await db
    .collection<User>(COLLECTIONS.USERS)
    .find(
      {
        $or: [
          { name: { $regex: `^${escapeRegex(query)}`, $options: "i" } },
          { email: { $regex: `^${escapeRegex(query)}`, $options: "i" } },
        ],
      },
      { projection: { _id: 0 } },
    )
    .limit(50)
    .toArray();

  const result = users
    .filter((u) => u.clerkId !== userId && !blockedByMeSet.has(u.clerkId))
    .map((u) => ({
      id: u.clerkId,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl ?? null,
      presence: u.presence,
      // The blocker stays invisible to the blocked user (soft-filter flag).
      blockedByMe: blockedByMeSet.has(u.clerkId),
      blockedMe: blockedMeSet.has(u.clerkId),
      // Coherent follow state across sections (search/suggestions/etc).
      isFollowing: followingSet.has(u.clerkId),
      isFollower: followerSet.has(u.clerkId),
      isFriend: friendSet.has(u.clerkId),
    }));

  return corsJson(
    {
      users: result.slice(0, 50),
      nextCursor: null,
    },
    request,
  );
}
