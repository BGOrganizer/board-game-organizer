import type { User } from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { getBlockContext } from "@/app/lib/blocks";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Local enrichment of relationship rows with user data + presence from the
 * `users` collection (Phase 2). Replaces the Clerk API round-trip for list
 * endpoints so presence and avatars are cheap and always fresh.
 *
 * Block policy applied to the enriched profile (per user feedback):
 * - `blockedByMe` rows are already filtered out upstream (the blocker never
 *   sees the blocked user in lists).
 * - `blockedMe` (the viewer is blocked by the profile owner): the profile
 *   stays visible ONLY in the viewer's own following/friends lists, but its
 *   presence is hidden and interaction is disabled (the UI reads the flags).
 */
export async function enrichRelationshipsWithUsers<
  T extends { fromUserId: string; toUserId: string },
>(db: Db, relationships: T[], viewerId: string) {
  const otherIds = relationships.map((r) =>
    r.fromUserId === viewerId ? r.toUserId : r.fromUserId,
  );
  const users = await db
    .collection<User>(COLLECTIONS.USERS)
    .find({ clerkId: { $in: [...new Set(otherIds)] } }, { projection: { _id: 0 } })
    .toArray();
  const byId = new Map(users.map((u) => [u.clerkId, u]));

  const { blockedByMe, blockedMe } = await getBlockContext(db, viewerId);

  return relationships.map((r) => {
    const otherId = r.fromUserId === viewerId ? r.toUserId : r.fromUserId;
    const u = byId.get(otherId);
    if (!u) return { ...r, profile: null };
    const isBlockedMe = blockedMe.has(otherId);
    return {
      ...r,
      profile: {
        id: u.clerkId,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl ?? null,
        // Presence is hidden when the profile owner blocked the viewer.
        presence: isBlockedMe ? { online: false, lastActiveAt: "" } : u.presence,
        blockedByMe: blockedByMe.has(otherId),
        blockedMe: isBlockedMe,
        // Follow state relative to the viewer (coherent across sections).
        isFollowing: relationships.some((x) => x.fromUserId === viewerId && x.toUserId === otherId),
      },
    };
  });
}
