import type {
  Block,
  Follow,
  FriendRequest,
  FriendRequestStatus,
  User,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

export interface RelationshipEdge {
  fromUserId: string;
  toUserId: string;
  status?: FriendRequestStatus;
  createdAt?: Date;
  updatedAt?: Date;
  respondedAt?: Date;
}

/** MongoDB operations for follows, friend requests, friendships, and blocks. */
export class RelationshipRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  async userExists(userId: string): Promise<boolean> {
    return (
      (await this.db
        .collection<User>(COLLECTIONS.USERS)
        .countDocuments({ clerkId: userId }, this.opts)) > 0
    );
  }

  follow(fromUserId: string, toUserId: string) {
    const createdAt = new Date();
    return this.db
      .collection<Follow>(COLLECTIONS.FOLLOWS)
      .updateOne(
        { fromUserId, toUserId },
        { $setOnInsert: { fromUserId, toUserId, createdAt } },
        { upsert: true, ...this.opts },
      );
  }

  unfollow(fromUserId: string, toUserId: string) {
    return this.db
      .collection<Follow>(COLLECTIONS.FOLLOWS)
      .deleteOne({ fromUserId, toUserId }, this.opts);
  }

  findFriendRequest(fromUserId: string, toUserId: string) {
    return this.db
      .collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS)
      .findOne({ fromUserId, toUserId }, this.opts);
  }

  setFriendRequest(fromUserId: string, toUserId: string, status: FriendRequestStatus) {
    const now = new Date();
    return this.db.collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS).findOneAndUpdate(
      { fromUserId, toUserId },
      {
        $set: {
          fromUserId,
          toUserId,
          status,
          updatedAt: now,
          ...(status === "pending" ? {} : { respondedAt: now }),
        },
        ...(status === "pending" ? { $unset: { respondedAt: "" } } : {}),
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: "after", ...this.opts },
    );
  }

  deleteFriendRequest(fromUserId: string, toUserId: string, status?: FriendRequestStatus) {
    return this.db
      .collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS)
      .deleteOne({ fromUserId, toUserId, ...(status ? { status } : {}) }, this.opts);
  }

  clearFriendRequests(a: string, b: string) {
    return this.db.collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS).deleteMany(
      {
        $or: [
          { fromUserId: a, toUserId: b },
          { fromUserId: b, toUserId: a },
        ],
      },
      this.opts,
    );
  }

  async becomeFriends(a: string, b: string) {
    // MongoDB sessions cannot run concurrent operations.
    await this.setFriendRequest(a, b, "accepted");
    await this.setFriendRequest(b, a, "accepted");
    await this.follow(a, b);
    await this.follow(b, a);
  }

  unfriend(a: string, b: string) {
    return this.db.collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS).deleteMany(
      {
        status: "accepted",
        $or: [
          { fromUserId: a, toUserId: b },
          { fromUserId: b, toUserId: a },
        ],
      },
      this.opts,
    );
  }

  async isFriend(a: string, b: string): Promise<boolean> {
    const count = await this.db
      .collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS)
      .countDocuments(
        {
          status: "accepted",
          $or: [
            { fromUserId: a, toUserId: b },
            { fromUserId: b, toUserId: a },
          ],
        },
        this.opts,
      );
    return count >= 2;
  }

  findBlock(fromUserId: string, toUserId: string) {
    return this.db
      .collection<Block>(COLLECTIONS.BLOCKS)
      .findOne({ fromUserId, toUserId }, this.opts);
  }

  block(fromUserId: string, toUserId: string) {
    const createdAt = new Date();
    return this.db
      .collection<Block>(COLLECTIONS.BLOCKS)
      .updateOne(
        { fromUserId, toUserId },
        { $setOnInsert: { fromUserId, toUserId, createdAt } },
        { upsert: true, ...this.opts },
      );
  }

  unblock(fromUserId: string, toUserId: string) {
    return this.db
      .collection<Block>(COLLECTIONS.BLOCKS)
      .deleteOne({ fromUserId, toUserId }, this.opts);
  }

  async isBlocked(a: string, b: string): Promise<boolean> {
    const count = await this.db.collection<Block>(COLLECTIONS.BLOCKS).countDocuments(
      {
        $or: [
          { fromUserId: a, toUserId: b },
          { fromUserId: b, toUserId: a },
        ],
      },
      this.opts,
    );
    return count > 0;
  }

  async getBlockedUserIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .collection<Block>(COLLECTIONS.BLOCKS)
      .find({ $or: [{ fromUserId: userId }, { toUserId: userId }] }, this.opts)
      .toArray();
    return rows.map((row) => (row.fromUserId === userId ? row.toUserId : row.fromUserId));
  }

  async deleteAllForUser(userId: string) {
    const eitherDirection = { $or: [{ fromUserId: userId }, { toUserId: userId }] };
    await this.db.collection<Follow>(COLLECTIONS.FOLLOWS).deleteMany(eitherDirection, this.opts);
    await this.db
      .collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS)
      .deleteMany(eitherDirection, this.opts);
    await this.db.collection<Block>(COLLECTIONS.BLOCKS).deleteMany(eitherDirection, this.opts);
  }

  listFollowing(userId: string, excludedUserIds: string[] = []) {
    return this.db
      .collection<Follow>(COLLECTIONS.FOLLOWS)
      .find(
        { fromUserId: userId, toUserId: { $nin: excludedUserIds } },
        { projection: { _id: 0 }, ...this.opts },
      )
      .toArray();
  }

  listFollowers(userId: string, excludedUserIds: string[] = []) {
    return this.db
      .collection<Follow>(COLLECTIONS.FOLLOWS)
      .find(
        { toUserId: userId, fromUserId: { $nin: excludedUserIds } },
        { projection: { _id: 0 }, ...this.opts },
      )
      .toArray();
  }

  async listFriends(userId: string, excludedUserIds: string[] = []): Promise<RelationshipEdge[]> {
    const rows = await this.db
      .collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS)
      .find(
        {
          status: "accepted",
          $or: [{ fromUserId: userId }, { toUserId: userId }],
        },
        { projection: { _id: 0 }, ...this.opts },
      )
      .toArray();
    const excluded = new Set(excludedUserIds);
    const directions = new Map<string, number>();
    for (const row of rows) {
      const otherId = row.fromUserId === userId ? row.toUserId : row.fromUserId;
      if (otherId === userId || excluded.has(otherId)) continue;
      const direction = row.fromUserId === userId ? 1 : 2;
      directions.set(otherId, (directions.get(otherId) ?? 0) | direction);
    }
    return [...directions]
      .filter(([, direction]) => direction === 3)
      .map(([toUserId]) => ({ fromUserId: userId, toUserId, status: "accepted" }));
  }

  listIncomingFriendRequests(userId: string, excludedUserIds: string[] = []) {
    return this.db
      .collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS)
      .find(
        { toUserId: userId, fromUserId: { $nin: excludedUserIds }, status: "pending" },
        { projection: { _id: 0 }, ...this.opts },
      )
      .sort({ createdAt: -1 })
      .toArray();
  }

  listOutgoingFriendRequests(userId: string, excludedUserIds: string[] = []) {
    return this.db
      .collection<FriendRequest>(COLLECTIONS.FRIEND_REQUESTS)
      .find(
        { fromUserId: userId, toUserId: { $nin: excludedUserIds }, status: "pending" },
        { projection: { _id: 0 }, ...this.opts },
      )
      .sort({ createdAt: -1 })
      .toArray();
  }

  listBlocked(userId: string) {
    return this.db
      .collection<Block>(COLLECTIONS.BLOCKS)
      .find({ fromUserId: userId }, { projection: { _id: 0 }, ...this.opts })
      .sort({ createdAt: -1 })
      .toArray();
  }
}
