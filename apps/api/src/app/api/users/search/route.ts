import type { User } from "@board-game-organizer/schemas";
import { searchContactsParamsSchema } from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getBlockedByUserIds, getBlockedUserIds } from "@/app/lib/blocks";
import { COLLECTIONS, getDb } from "@/app/lib/db";
import { pruneRateLimitBuckets, rateLimit } from "@/app/lib/rateLimit";

/** Search rate limit: 20 requests per minute per user (product spec). */
const SEARCH_LIMIT = 20;
const SEARCH_WINDOW_MS = 60_000;

/**
 * GET /api/users/search?query=…
 *
 * Contact search over the `users` collection's text index (name/email),
 * with the asymmetric block policy:
 * - users `viewer` blocked  → excluded
 * - users who blocked `viewer` → findable EXCEPT when they are excluded by
 *   the text query results themselves (they stay visible so the blocker
 *   perceives nothing).
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  pruneRateLimitBuckets();
  const limited = rateLimit(`search:${userId}`, SEARCH_LIMIT, SEARCH_WINDOW_MS);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const parsed = searchContactsParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const { query } = parsed.data;
  const db = await getDb();
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(db, userId),
    getBlockedByUserIds(db, userId),
  ]);
  const blockedByMeSet = new Set(blockedByMe);
  const blockedMeSet = new Set(blockedMe);

  const users = await db
    .collection<User>(COLLECTIONS.USERS)
    .find({ $text: { $search: query } }, { projection: { _id: 0 } })
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
    }));

  return NextResponse.json({
    users: result.slice(0, 50),
    nextCursor: null,
  });
}
