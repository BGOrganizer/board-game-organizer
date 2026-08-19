import type { User } from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Local enrichment of relationship rows with user data + presence from the
 * `users` collection (Phase 2). Replaces the Clerk API round-trip for list
 * endpoints so presence and avatars are cheap and always fresh.
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

  return relationships.map((r) => {
    const otherId = r.fromUserId === viewerId ? r.toUserId : r.fromUserId;
    const u = byId.get(otherId);
    return {
      ...r,
      profile: u
        ? {
            id: u.clerkId,
            name: u.name,
            email: u.email,
            avatarUrl: u.avatarUrl ?? null,
            presence: u.presence,
          }
        : null,
    };
  });
}
