import type { User } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { getBlockContext } from "@/app/lib/blocks";
import { COLLECTIONS } from "@/app/lib/db";

/** Enrich relationship edges with local profiles and viewer-relative state. */
export async function enrichRelationshipsWithUsers<
  T extends { fromUserId: string; toUserId: string },
>(db: Db, relationships: T[], viewerId: string, session?: ClientSession) {
  const otherIds = [
    ...new Set(
      relationships.map((row) => (row.fromUserId === viewerId ? row.toUserId : row.fromUserId)),
    ),
  ];
  const opts = session ? { session } : {};
  const users = await db
    .collection<User>(COLLECTIONS.USERS)
    .find({ clerkId: { $in: otherIds } }, { projection: { _id: 0 }, ...opts })
    .toArray();
  const follows = await db
    .collection(COLLECTIONS.FOLLOWS)
    .find(
      {
        $or: [
          { fromUserId: viewerId, toUserId: { $in: otherIds } },
          { toUserId: viewerId, fromUserId: { $in: otherIds } },
        ],
      },
      opts,
    )
    .toArray();
  const friendRequests = await db
    .collection(COLLECTIONS.FRIEND_REQUESTS)
    .find(
      {
        status: "accepted",
        $or: [
          { fromUserId: viewerId, toUserId: { $in: otherIds } },
          { toUserId: viewerId, fromUserId: { $in: otherIds } },
        ],
      },
      opts,
    )
    .toArray();
  const { blockedByMe, blockedMe } = await getBlockContext(db, viewerId, session);

  const usersById = new Map(users.map((user) => [user.clerkId, user]));
  const following = new Set(
    follows.filter((follow) => follow.fromUserId === viewerId).map((follow) => follow.toUserId),
  );
  const followers = new Set(
    follows.filter((follow) => follow.toUserId === viewerId).map((follow) => follow.fromUserId),
  );
  const friendDirections = new Map<string, number>();
  for (const request of friendRequests) {
    const otherId = request.fromUserId === viewerId ? request.toUserId : request.fromUserId;
    const direction = request.fromUserId === viewerId ? 1 : 2;
    friendDirections.set(otherId, (friendDirections.get(otherId) ?? 0) | direction);
  }

  return relationships.map((relationship) => {
    const otherId =
      relationship.fromUserId === viewerId ? relationship.toUserId : relationship.fromUserId;
    const user = usersById.get(otherId);
    if (!user) return { ...relationship, profile: null };

    const isBlockedByMe = blockedByMe.has(otherId);
    const isBlockedMe = blockedMe.has(otherId);
    return {
      ...relationship,
      profile: {
        id: user.clerkId,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
        presence:
          isBlockedMe || isBlockedByMe ? { online: false, lastActiveAt: "" } : user.presence,
        blockedByMe: isBlockedByMe,
        blockedMe: isBlockedMe,
        isFollowing: following.has(otherId),
        isFollower: followers.has(otherId),
        isFriend: friendDirections.get(otherId) === 3,
      },
    };
  });
}
