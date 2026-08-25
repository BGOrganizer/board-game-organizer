import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Shared block filtering (Phase 2). THE single place that applies the block
 * policy; every contact/search/suggestion/presence read goes through it.
 *
 * Policy (asymmetric):
 * - `blockedByMe`: hidden EVERYWHERE (search, suggestions, lists, presence).
 * - `blockedMe`: hidden from suggestions/presence, but STILL findable by
 *   explicit search — the blocker must perceive nothing, so a blocked user
 *   cannot silently disappear from a search the blocker runs.
 */
export async function getBlockedUserIds(db: Db, userId: string): Promise<string[]> {
  const blocks = await db.collection(COLLECTIONS.BLOCKS).find({ fromUserId: userId }).toArray();
  return blocks.map((b) => b.toUserId);
}

/** Users who blocked `userId` (inverse direction). */
export async function getBlockedByUserIds(db: Db, userId: string): Promise<string[]> {
  const blocks = await db.collection(COLLECTIONS.BLOCKS).find({ toUserId: userId }).toArray();
  return blocks.map((b) => b.fromUserId);
}

/** Removes users `currentUserId` has blocked (blockedByMe policy). */
export function filterBlockedByMe(userIds: string[], blockedByMe: Set<string>): string[] {
  return userIds.filter((id) => !blockedByMe.has(id));
}

/**
 * Full block context for a viewer: ids blocked by the viewer (hard filter)
 * and ids that blocked the viewer (soft filter — excluded from suggestions
 * and presence, but not from explicit search).
 */
export async function getBlockContext(db: Db, viewerId: string) {
  const [blockedByMe, blockedMe] = await Promise.all([
    getBlockedUserIds(db, viewerId),
    getBlockedByUserIds(db, viewerId),
  ]);
  return {
    blockedByMe: new Set(blockedByMe),
    blockedMe: new Set(blockedMe),
  };
}
