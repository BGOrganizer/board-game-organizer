import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";
import type { RelationshipStatus, RelationshipType } from "@/app/models/relationship";

type Direction = "from" | "to";

/**
 * Repository over the Phase 1 social collections (`follows`,
 * `friendRequests`, `blocks`).
 *
 * Public surface matches the pre-Phase-1 `RelationshipRepository` so the
 * actions/handler layers (and their tests) are unchanged. Internally:
 * - `follow`  → `follows` (directed edge, no status)
 * - `friend_request` → `friendRequests` (status pending/accepted/rejected)
 * - `block` → `blocks` (directed edge)
 * - `friend` → derived: a pair of accepted friend requests (both directions)
 *
 * The legacy single `relationships` collection is NOT used anymore
 * (`DROP_LEGACY_RELATIONSHIPS=true` removes it during the migration).
 */
export class RelationshipRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  private col(type: RelationshipType) {
    switch (type) {
      case "follow":
        return this.db.collection(COLLECTIONS.FOLLOWS);
      case "friend_request":
        return this.db.collection(COLLECTIONS.FRIEND_REQUESTS);
      default: // "block"
        return this.db.collection(COLLECTIONS.BLOCKS);
    }
  }

  private static toEdge(
    type: RelationshipType,
    from: string,
    to: string,
    status?: RelationshipStatus,
  ) {
    // follows/blocks have no status column; friend_requests do.
    return type === "friend_request"
      ? { fromUserId: from, toUserId: to, ...(status ? { status } : {}) }
      : { fromUserId: from, toUserId: to };
  }

  find = (
    from: string,
    to: string,
    type: "follow" | "friend_request" | "block",
  ): Promise<Record<string, unknown> | null> =>
    this.col(type).findOne(
      RelationshipRepository.toEdge(type, from, to),
      this.opts,
    ) as Promise<Record<string, unknown> | null>;

  upsert = (
    from: string,
    to: string,
    type: RelationshipType,
    status: RelationshipStatus,
  ): Promise<unknown> => {
    if (type === "friend") {
      // Derived — friendship is a pair of accepted friend requests.
      return this.upsert(from, to, "friend_request", "accepted");
    }
    const now = new Date();
    return this.col(type).findOneAndUpdate(
      { fromUserId: from, toUserId: to },
      {
        $set: {
          ...(type === "friend_request" ? { status, updatedAt: now } : {}),
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: "after", ...this.opts },
    ) as Promise<unknown>;
  };

  delete = (from: string, to: string, type: RelationshipType) => {
    if (type === "friend") {
      // Removing a friendship deletes both accepted requests.
      return this.clearBidirectional(from, to, ["friend_request"]);
    }
    return this.col(type).deleteOne({ fromUserId: from, toUserId: to }, this.opts);
  };

  async clearBidirectional(a: string, b: string, types: RelationshipType[]) {
    await Promise.all(types.flatMap((t) => [this.delete(a, b, t), this.delete(b, a, t)]));
  }

  async becomeFriends(a: string, b: string) {
    await Promise.all([
      this.upsert(a, b, "friend_request", "accepted"),
      this.upsert(b, a, "friend_request", "accepted"),
      this.upsert(a, b, "follow", "accepted"),
      this.upsert(b, a, "follow", "accepted"),
    ]);
  }

  async isBlocked(a: string, b: string) {
    const count = await this.db.collection(COLLECTIONS.BLOCKS).countDocuments(
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

  async getBlockedUserIds(userId: string) {
    const blocks = await this.db
      .collection(COLLECTIONS.BLOCKS)
      .find({ $or: [{ fromUserId: userId }, { toUserId: userId }] }, this.opts)
      .toArray();
    return blocks.map((b) => (b.fromUserId === userId ? b.toUserId : b.fromUserId));
  }

  async isFriend(a: string, b: string) {
    const count = await this.db.collection(COLLECTIONS.FRIEND_REQUESTS).countDocuments(
      {
        status: "accepted",
        $or: [
          { fromUserId: a, toUserId: b },
          { fromUserId: b, toUserId: a },
        ],
      },
      this.opts,
    );
    // Friendship = accepted in both directions.
    return count >= 2;
  }

  async list(
    userId: string,
    type: RelationshipType,
    status: RelationshipStatus,
    direction: Direction,
  ): Promise<Array<{ fromUserId: string; toUserId: string }>> {
    const blocked = await this.getBlockedUserIds(userId);
    const [selfField, otherField] =
      direction === "from" ? ["fromUserId", "toUserId"] : ["toUserId", "fromUserId"];

    if (type === "friend") {
      // Derived: accepted requests where the other side accepted too.
      const rows = await this.db
        .collection(COLLECTIONS.FRIEND_REQUESTS)
        .find({ [selfField]: userId, status, [otherField]: { $nin: blocked } }, this.opts)
        .toArray();
      const withReverse = await Promise.all(
        rows.map((r) =>
          this.db
            .collection(COLLECTIONS.FRIEND_REQUESTS)
            .countDocuments(
              { [otherField]: userId, [selfField]: r[otherField as "toUserId"], status },
              this.opts,
            ),
        ),
      );
      return rows.filter((_, i) => withReverse[i] > 0) as unknown as Array<{
        fromUserId: string;
        toUserId: string;
      }>;
    }

    const filter = { [selfField]: userId, [otherField]: { $nin: blocked } };
    if (type === "friend_request") {
      (filter as Record<string, unknown>).status = status;
    }
    return (await this.db
      .collection(type === "follow" ? COLLECTIONS.FOLLOWS : COLLECTIONS.FRIEND_REQUESTS)
      .find(filter, this.opts)
      .toArray()) as unknown as Array<{ fromUserId: string; toUserId: string }>;
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
      this.isFriend(viewerId, targetId),
    ]);
    return {
      isFollowing: !!follows,
      isFriend: friend,
      friendRequestSent: sent?.status === "pending",
      friendRequestReceived: received?.status === "pending",
      hasBlocked: !!blockedByViewer,
      isBlockedBy: false,
    };
  }
}
