import type { FriendRequest } from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

export async function pendingContactRequestIds(db: Db, viewer: string): Promise<string[]> {
  const requests = await db
    .collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS)
    .find(
      { status: "pending", $or: [{ fromUserId: viewer }, { toUserId: viewer }] },
      { projection: { _id: 0, fromUserId: 1, toUserId: 1 } },
    )
    .toArray();
  return requests.map((request) =>
    request.fromUserId === viewer ? request.toUserId : request.fromUserId,
  );
}
