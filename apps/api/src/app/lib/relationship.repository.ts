import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";
import type { Relationship, RelationshipStatus, RelationshipType } from "@/app/models/relationship";

type Direction = "from" | "to";

export class RelationshipRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get col() {
    return this.db.collection<Relationship>(COLLECTIONS.RELATIONSHIPS);
  }
  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  find = (from: string, to: string, type: RelationshipType) =>
    this.col.findOne({ fromUserId: from, toUserId: to, type }, this.opts);

  upsert = (from: string, to: string, type: RelationshipType, status: RelationshipStatus) =>
    this.col.findOneAndUpdate(
      { fromUserId: from, toUserId: to, type },
      { $set: { status, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, returnDocument: "after", ...this.opts },
    );

  delete = (from: string, to: string, type: RelationshipType) =>
    this.col.deleteOne({ fromUserId: from, toUserId: to, type }, this.opts);

  async clearBidirectional(a: string, b: string, types: RelationshipType[]) {
    await Promise.all(types.flatMap((t) => [this.delete(a, b, t), this.delete(b, a, t)]));
  }

  async becomeFriends(a: string, b: string) {
    await Promise.all([
      this.upsert(a, b, "friend", "accepted"),
      this.upsert(b, a, "friend", "accepted"),
      this.upsert(a, b, "follow", "accepted"),
      this.upsert(b, a, "follow", "accepted"),
    ]);
  }

  async isBlocked(a: string, b: string) {
    const count = await this.col.countDocuments(
      {
        type: "block",
        $or: [
          { fromUserId: a, toUserId: b },
          { fromUserId: b, toUserId: a },
        ],
      },
      this.opts,
    );
    return count > 0;
  }

  async getBlockedUserIds(userId: string) {
    const blocks = await this.col
      .find({ type: "block", $or: [{ fromUserId: userId }, { toUserId: userId }] }, this.opts)
      .toArray();
    return blocks.map((b) => (b.fromUserId === userId ? b.toUserId : b.fromUserId));
  }

  // Copre followers / following / friends / pending / sent con un'unica query parametrizzata
  async list(
    userId: string,
    type: RelationshipType,
    status: RelationshipStatus,
    direction: Direction,
  ) {
    const blocked = await this.getBlockedUserIds(userId);
    const [selfField, otherField] =
      direction === "from" ? ["fromUserId", "toUserId"] : ["toUserId", "fromUserId"];

    return this.col
      .find({ [selfField]: userId, type, status, [otherField]: { $nin: blocked } }, this.opts)
      .toArray();
  }

  async getRelationshipStatus(viewerId: string, targetId: string) {
    const [blockedByViewer, blockedByTarget] = await Promise.all([
      this.find(viewerId, targetId, "block"),
      this.find(targetId, viewerId, "block"),
    ]);

    if (blockedByTarget) {
      return {
        isFollowing: false,
        isFriend: false,
        friendRequestSent: false,
        friendRequestReceived: false,
        hasBlocked: false,
        isBlockedBy: true,
      };
    }

    const [follows, sent, received, friend] = await Promise.all([
      this.find(viewerId, targetId, "follow"),
      this.find(viewerId, targetId, "friend_request"),
      this.find(targetId, viewerId, "friend_request"),
      this.find(viewerId, targetId, "friend"),
    ]);

    return {
      isFollowing: !!follows,
      isFriend: !!friend,
      friendRequestSent: sent?.status === "pending",
      friendRequestReceived: received?.status === "pending",
      hasBlocked: !!blockedByViewer,
      isBlockedBy: false,
    };
  }
}
