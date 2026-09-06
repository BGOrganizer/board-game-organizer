import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelationshipRepository } from "../relationship.repository";
import { RelationshipError, RelationshipService } from "../relationship.service";

const USER = "user_actor";
const TARGET = "user_target";

function createRepo(overrides: Partial<Record<keyof RelationshipRepository, unknown>> = {}) {
  return {
    userExists: vi.fn(async () => true),
    follow: vi.fn(async () => ({ acknowledged: true })),
    unfollow: vi.fn(async () => ({ deletedCount: 1 })),
    findFriendRequest: vi.fn(async () => null),
    setFriendRequest: vi.fn(async () => null),
    deleteFriendRequest: vi.fn(async () => ({ deletedCount: 1 })),
    clearFriendRequests: vi.fn(async () => ({ deletedCount: 0 })),
    becomeFriends: vi.fn(async () => undefined),
    unfriend: vi.fn(async () => ({ deletedCount: 2 })),
    isFriend: vi.fn(async () => false),
    findBlock: vi.fn(async () => null),
    block: vi.fn(async () => ({ acknowledged: true })),
    unblock: vi.fn(async () => ({ deletedCount: 1 })),
    isBlocked: vi.fn(async () => false),
    getBlockedUserIds: vi.fn(async () => []),
    listFollowing: vi.fn(async () => []),
    listFollowers: vi.fn(async () => []),
    listFriends: vi.fn(async () => []),
    listIncomingFriendRequests: vi.fn(async () => []),
    listOutgoingFriendRequests: vi.fn(async () => []),
    listBlocked: vi.fn(async () => []),
    ...overrides,
  } as unknown as RelationshipRepository;
}

async function expectRelationshipError(promise: Promise<unknown>, status: number, message: string) {
  await expect(promise).rejects.toMatchObject({ status, message });
}

describe("RelationshipService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires the authenticated user to be synchronized", async () => {
    const service = new RelationshipService(createRepo({ userExists: vi.fn(async () => false) }));
    await expectRelationshipError(
      service.requireCurrentUser(USER),
      409,
      "User profile not synchronized",
    );
  });

  it("accepts a synchronized authenticated user", async () => {
    await expect(
      new RelationshipService(createRepo()).requireCurrentUser(USER),
    ).resolves.toBeUndefined();
  });

  it("follows a visible existing user", async () => {
    const repo = createRepo();
    await new RelationshipService(repo).follow(USER, TARGET);
    expect(repo.follow).toHaveBeenCalledWith(USER, TARGET);
  });

  it("rejects self, missing, and blocked follow targets", async () => {
    await expectRelationshipError(
      new RelationshipService(createRepo()).follow(USER, USER),
      400,
      "Cannot follow yourself",
    );
    await expectRelationshipError(
      new RelationshipService(createRepo({ userExists: vi.fn(async () => false) })).follow(
        USER,
        TARGET,
      ),
      404,
      "User not found",
    );
    await expectRelationshipError(
      new RelationshipService(createRepo({ isBlocked: vi.fn(async () => true) })).follow(
        USER,
        TARGET,
      ),
      404,
      "User not found",
    );
  });

  it("unfollows a visible user", async () => {
    const repo = createRepo();
    await new RelationshipService(repo).unfollow(USER, TARGET);
    expect(repo.unfollow).toHaveBeenCalledWith(USER, TARGET);
  });

  it("sends and resends a rejected friend request", async () => {
    const repo = createRepo({
      findFriendRequest: vi
        .fn()
        .mockResolvedValueOnce({ status: "rejected" })
        .mockResolvedValueOnce(null),
    });
    await new RelationshipService(repo).sendFriendRequest(USER, TARGET);
    expect(repo.setFriendRequest).toHaveBeenCalledWith(USER, TARGET, "pending");
  });

  it.each(["pending", "accepted"] as const)(
    "rejects an outgoing %s friend request",
    async (status) => {
      const repo = createRepo({
        findFriendRequest: vi.fn(async () => ({ status })),
      });
      await expectRelationshipError(
        new RelationshipService(repo).sendFriendRequest(USER, TARGET),
        409,
        "Friend request already sent",
      );
    },
  );

  it("rejects requests for an existing friend or incoming pending request", async () => {
    await expectRelationshipError(
      new RelationshipService(createRepo({ isFriend: vi.fn(async () => true) })).sendFriendRequest(
        USER,
        TARGET,
      ),
      409,
      "Already friends",
    );
    const repo = createRepo({
      findFriendRequest: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: "pending" }),
    });
    await expectRelationshipError(
      new RelationshipService(repo).sendFriendRequest(USER, TARGET),
      409,
      "Incoming friend request already exists",
    );
  });

  it("accepts a pending friend request", async () => {
    const repo = createRepo({
      findFriendRequest: vi.fn(async () => ({ status: "pending" })),
    });
    await new RelationshipService(repo).respondToFriendRequest(USER, TARGET, "accepted");
    expect(repo.becomeFriends).toHaveBeenCalledWith(USER, TARGET);
  });

  it("rejects a pending friend request", async () => {
    const repo = createRepo({
      findFriendRequest: vi.fn(async () => ({ status: "pending" })),
    });
    await new RelationshipService(repo).respondToFriendRequest(USER, TARGET, "rejected");
    expect(repo.setFriendRequest).toHaveBeenCalledWith(TARGET, USER, "rejected");
  });

  it.each([null, { status: "rejected" }])(
    "rejects a response without an incoming pending request",
    async (request) => {
      const repo = createRepo({ findFriendRequest: vi.fn(async () => request) });
      await expectRelationshipError(
        new RelationshipService(repo).respondToFriendRequest(USER, TARGET, "accepted"),
        404,
        "No pending friend request",
      );
    },
  );

  it("cancels only an outgoing pending request", async () => {
    const repo = createRepo();
    await new RelationshipService(repo).cancelFriendRequest(USER, TARGET);
    expect(repo.deleteFriendRequest).toHaveBeenCalledWith(USER, TARGET, "pending");

    const missing = createRepo({
      deleteFriendRequest: vi.fn(async () => ({ deletedCount: 0 })),
    });
    await expectRelationshipError(
      new RelationshipService(missing).cancelFriendRequest(USER, TARGET),
      404,
      "No pending friend request",
    );
  });

  it("removes an existing friendship and preserves follows", async () => {
    const repo = createRepo({ isFriend: vi.fn(async () => true) });
    await new RelationshipService(repo).unfriend(USER, TARGET);
    expect(repo.unfriend).toHaveBeenCalledWith(USER, TARGET);
    expect(repo.unfollow).not.toHaveBeenCalled();
  });

  it("rejects removal of a missing friendship", async () => {
    await expectRelationshipError(
      new RelationshipService(createRepo()).unfriend(USER, TARGET),
      404,
      "Friendship not found",
    );
  });

  it("blocks transactionally while preserving the target follow", async () => {
    const repo = createRepo();
    await new RelationshipService(repo).block(USER, TARGET);
    expect(repo.unfollow).toHaveBeenCalledWith(USER, TARGET);
    expect(repo.unfollow).not.toHaveBeenCalledWith(TARGET, USER);
    expect(repo.clearFriendRequests).toHaveBeenCalledWith(USER, TARGET);
    expect(repo.block).toHaveBeenCalledWith(USER, TARGET);
  });

  it("rejects self-block and a block from an invisible target", async () => {
    await expectRelationshipError(
      new RelationshipService(createRepo()).block(USER, USER),
      400,
      "Cannot block yourself",
    );
    const reverseBlock = createRepo({
      findBlock: vi.fn(async (from: string) => (from === TARGET ? {} : null)),
    });
    await expectRelationshipError(
      new RelationshipService(reverseBlock).block(USER, TARGET),
      404,
      "User not found",
    );
  });

  it("treats an existing own block as idempotent", async () => {
    const repo = createRepo({
      findBlock: vi.fn(async (from: string) => (from === USER ? {} : null)),
    });
    await new RelationshipService(repo).block(USER, TARGET);
    expect(repo.unfollow).not.toHaveBeenCalled();
    expect(repo.block).not.toHaveBeenCalled();
  });

  it("unblocks an existing or absent own block idempotently", async () => {
    const existing = createRepo({ findBlock: vi.fn(async () => ({})) });
    await new RelationshipService(existing).unblock(USER, TARGET);
    expect(existing.unblock).toHaveBeenCalledWith(USER, TARGET);

    const absent = createRepo();
    await new RelationshipService(absent).unblock(USER, TARGET);
    expect(absent.unblock).toHaveBeenCalledWith(USER, TARGET);
  });

  it("hides a reverse blocker during unblock", async () => {
    const repo = createRepo({
      findBlock: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({}),
    });
    await expectRelationshipError(
      new RelationshipService(repo).unblock(USER, TARGET),
      404,
      "User not found",
    );
  });

  it("lists every relationship type and filters blocked pairs", async () => {
    const repo = createRepo({ getBlockedUserIds: vi.fn(async () => ["user_hidden"]) });
    const service = new RelationshipService(repo);

    await service.list(USER, "following");
    await service.list(USER, "followers");
    await service.list(USER, "friends");
    await service.list(USER, "pending");
    await service.list(USER, "sent");
    await service.list(USER, "blocked");

    expect(repo.listFollowing).toHaveBeenCalledWith(USER, ["user_hidden"]);
    expect(repo.listFollowers).toHaveBeenCalledWith(USER, ["user_hidden"]);
    expect(repo.listFriends).toHaveBeenCalledWith(USER, ["user_hidden"]);
    expect(repo.listIncomingFriendRequests).toHaveBeenCalledWith(USER, ["user_hidden"]);
    expect(repo.listOutgoingFriendRequests).toHaveBeenCalledWith(USER, ["user_hidden"]);
    expect(repo.listBlocked).toHaveBeenCalledWith(USER);
  });

  it("exposes typed relationship errors", () => {
    const error = new RelationshipError(418, "teapot");
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(418);
  });
});
