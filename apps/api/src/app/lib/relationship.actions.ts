import { httpError } from "@/app/lib/handler";
import type { RelationshipRepository } from "@/app/lib/relationship.repository";

type Action = (userId: string, targetUserId: string, repo: RelationshipRepository) => Promise<any>;

export const CREATE: Record<string, Action> = {
  follow: async (userId, targetUserId, repo) => {
    if (userId === targetUserId) throw httpError(400, "Cannot follow yourself");
    if (await repo.isBlocked(userId, targetUserId)) throw httpError(404, "User not found");
    await repo.upsert(userId, targetUserId, "follow", "accepted");
  },

  friend_request: async (userId, targetUserId, repo) => {
    if (userId === targetUserId) throw httpError(400, "Cannot friend yourself");
    if (await repo.isBlocked(userId, targetUserId)) throw httpError(404, "User not found");

    const incoming = await repo.find(targetUserId, userId, "friend_request");
    if (incoming?.status === "pending") {
      await repo.upsert(targetUserId, userId, "friend_request", "accepted");
      await repo.becomeFriends(userId, targetUserId);
      return { autoAccepted: true };
    }
    await repo.upsert(userId, targetUserId, "friend_request", "pending");
  },

  block: async (userId, targetUserId, repo) => {
    await repo.clearBidirectional(userId, targetUserId, ["follow", "friend_request", "friend"]);
    await repo.upsert(userId, targetUserId, "block", "blocked");
  },
};

export const REMOVE: Record<string, Action> = {
  follow: (userId, targetUserId, repo) => repo.delete(userId, targetUserId, "follow"),
  friend_request: (userId, targetUserId, repo) =>
    repo.clearBidirectional(userId, targetUserId, ["friend_request"]),
  friend: (userId, targetUserId, repo) =>
    repo.clearBidirectional(userId, targetUserId, ["friend", "friend_request"]), // follow preservato
  block: (userId, targetUserId, repo) => repo.delete(userId, targetUserId, "block"),
};

export const UPDATE: Record<string, Action> = {
  // targetUserId qui è il mittente della richiesta (fromUserId)
  friend_request: async (userId, fromUserId, repo) => {
    if (await repo.isBlocked(userId, fromUserId)) throw httpError(404, "User not found");
    const request = await repo.find(fromUserId, userId, "friend_request");
    if (request?.status !== "pending") throw httpError(404, "No pending request");

    await repo.upsert(fromUserId, userId, "friend_request", "accepted");
    await repo.becomeFriends(userId, fromUserId);
  },
};
