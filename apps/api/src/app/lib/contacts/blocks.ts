import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/** IDs explicitly blocked by the viewer. */
export async function getBlockedUserIds(
  db: Db,
  userId: string,
  session?: ClientSession,
): Promise<string[]> {
  const blocks = await db
    .collection(COLLECTIONS.BLOCKS)
    .find({ fromUserId: userId }, session ? { session } : {})
    .toArray();
  return blocks.map((block) => block.toUserId);
}

/** IDs whose owners blocked the viewer. */
export async function getBlockedByUserIds(
  db: Db,
  userId: string,
  session?: ClientSession,
): Promise<string[]> {
  const blocks = await db
    .collection(COLLECTIONS.BLOCKS)
    .find({ toUserId: userId }, session ? { session } : {})
    .toArray();
  return blocks.map((block) => block.fromUserId);
}

export function filterBlockedByMe(userIds: string[], blockedByMe: Set<string>): string[] {
  return userIds.filter((id) => !blockedByMe.has(id));
}

export async function getBlockContext(db: Db, viewerId: string, session?: ClientSession) {
  // Sequential: MongoDB forbids concurrent operations on one session.
  const blockedByMe = await getBlockedUserIds(db, viewerId, session);
  const blockedMe = await getBlockedByUserIds(db, viewerId, session);
  return {
    blockedByMe: new Set(blockedByMe),
    blockedMe: new Set(blockedMe),
  };
}
