import type { RelationshipEdge, RelationshipRepository } from "@/app/lib/relationship.repository";

export type RelationshipListType =
  | "followers"
  | "following"
  | "friends"
  | "pending"
  | "sent"
  | "blocked";

export class RelationshipError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Domain rules for follows, friend requests, friendships, and blocks. */
export class RelationshipService {
  constructor(private repo: RelationshipRepository) {}

  private rejectSelf(userId: string, targetUserId: string, action: string) {
    if (userId === targetUserId) {
      throw new RelationshipError(400, `Cannot ${action} yourself`);
    }
  }

  async requireCurrentUser(userId: string) {
    if (!(await this.repo.userExists(userId))) {
      throw new RelationshipError(409, "User profile not synchronized");
    }
  }

  private async requireExistingTarget(targetUserId: string) {
    if (!(await this.repo.userExists(targetUserId))) {
      throw new RelationshipError(404, "User not found");
    }
  }

  private async requireVisibleTarget(userId: string, targetUserId: string, action: string) {
    this.rejectSelf(userId, targetUserId, action);
    await this.requireExistingTarget(targetUserId);
    if (await this.repo.isBlocked(userId, targetUserId)) {
      // Same response for missing and blocked users: never reveal a block.
      throw new RelationshipError(404, "User not found");
    }
  }

  async follow(userId: string, targetUserId: string) {
    await this.requireVisibleTarget(userId, targetUserId, "follow");
    await this.repo.follow(userId, targetUserId);
  }

  async unfollow(userId: string, targetUserId: string) {
    await this.requireVisibleTarget(userId, targetUserId, "unfollow");
    await this.repo.unfollow(userId, targetUserId);
  }

  async sendFriendRequest(userId: string, targetUserId: string) {
    await this.requireVisibleTarget(userId, targetUserId, "friend");
    if (await this.repo.isFriend(userId, targetUserId)) {
      throw new RelationshipError(409, "Already friends");
    }

    const outgoing = await this.repo.findFriendRequest(userId, targetUserId);
    if (outgoing?.status === "pending" || outgoing?.status === "accepted") {
      throw new RelationshipError(409, "Friend request already sent");
    }

    const incoming = await this.repo.findFriendRequest(targetUserId, userId);
    if (incoming?.status === "pending") {
      throw new RelationshipError(409, "Incoming friend request already exists");
    }

    await this.repo.setFriendRequest(userId, targetUserId, "pending");
  }

  async respondToFriendRequest(
    userId: string,
    senderUserId: string,
    decision: "accepted" | "rejected",
  ) {
    await this.requireVisibleTarget(userId, senderUserId, "friend");
    const incoming = await this.repo.findFriendRequest(senderUserId, userId);
    if (incoming?.status !== "pending") {
      throw new RelationshipError(404, "No pending friend request");
    }

    if (decision === "accepted") {
      await this.repo.becomeFriends(userId, senderUserId);
    } else {
      await this.repo.setFriendRequest(senderUserId, userId, "rejected");
    }
  }

  async cancelFriendRequest(userId: string, targetUserId: string) {
    await this.requireVisibleTarget(userId, targetUserId, "friend");
    const result = await this.repo.deleteFriendRequest(userId, targetUserId, "pending");
    if (result.deletedCount === 0) {
      throw new RelationshipError(404, "No pending friend request");
    }
  }

  async unfriend(userId: string, targetUserId: string) {
    await this.requireVisibleTarget(userId, targetUserId, "unfriend");
    if (!(await this.repo.isFriend(userId, targetUserId))) {
      throw new RelationshipError(404, "Friendship not found");
    }
    // Relationship routes run in one transaction; keep session operations sequential.
    await this.repo.unfriend(userId, targetUserId);
    await this.repo.unfollow(userId, targetUserId);
  }

  async block(userId: string, targetUserId: string) {
    this.rejectSelf(userId, targetUserId, "block");
    await this.requireExistingTarget(targetUserId);

    if (await this.repo.findBlock(targetUserId, userId)) {
      throw new RelationshipError(404, "User not found");
    }
    if (await this.repo.findBlock(userId, targetUserId)) return;

    // Preserve target -> blocker follow so the blocked user cannot infer the block.
    await this.repo.unfollow(userId, targetUserId);
    await this.repo.clearFriendRequests(userId, targetUserId);
    await this.repo.block(userId, targetUserId);
  }

  async unblock(userId: string, targetUserId: string) {
    this.rejectSelf(userId, targetUserId, "unblock");
    await this.requireExistingTarget(targetUserId);

    const ownBlock = await this.repo.findBlock(userId, targetUserId);
    if (!ownBlock && (await this.repo.findBlock(targetUserId, userId))) {
      throw new RelationshipError(404, "User not found");
    }
    await this.repo.unblock(userId, targetUserId);
  }

  async list(userId: string, type: RelationshipListType): Promise<RelationshipEdge[]> {
    if (type === "blocked") return this.repo.listBlocked(userId);

    const blockedUserIds = await this.repo.getBlockedUserIds(userId);
    switch (type) {
      case "following":
        return this.repo.listFollowing(userId, blockedUserIds);
      case "followers":
        return this.repo.listFollowers(userId, blockedUserIds);
      case "friends":
        return this.repo.listFriends(userId, blockedUserIds);
      case "pending":
        return this.repo.listIncomingFriendRequests(userId, blockedUserIds);
      case "sent":
        return this.repo.listOutgoingFriendRequests(userId, blockedUserIds);
    }
  }
}
