import { describe, expect, it, vi } from "vitest";
import { CREATE, REMOVE, UPDATE } from "../relationship.actions";
import type { RelationshipRepository } from "../relationship.repository";

/**
 * Fake repository: a plain object implementing the repository surface the
 * actions rely on, recording every call for assertions.
 */
function createFakeRepo(overrides: Partial<Record<keyof RelationshipRepository, unknown>> = {}) {
  const calls: unknown[] = [];
  const repo = {
    calls,
    isBlocked: vi.fn(async () => false),
    upsert: vi.fn(async (...args: unknown[]) => calls.push(["upsert", ...args])),
    find: vi.fn(async () => null),
    becomeFriends: vi.fn(async (...args: unknown[]) => calls.push(["becomeFriends", ...args])),
    clearBidirectional: vi.fn(async (...args: unknown[]) =>
      calls.push(["clearBidirectional", ...args]),
    ),
    delete: vi.fn(async (...args: unknown[]) => calls.push(["delete", ...args])),
    ...overrides,
  };
  return repo as unknown as RelationshipRepository & typeof repo;
}

describe("CREATE.follow", () => {
  it("follows another user immediately (accepted)", async () => {
    const repo = createFakeRepo();
    await CREATE.follow("user_1", "user_2", repo);
    expect(repo.upsert).toHaveBeenCalledWith("user_1", "user_2", "follow", "accepted");
  });

  it("rejects following yourself", async () => {
    const repo = createFakeRepo();
    await expect(CREATE.follow("user_1", "user_1", repo)).rejects.toMatchObject({ status: 400 });
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("hides blocked users (404)", async () => {
    const repo = createFakeRepo({ isBlocked: vi.fn(async () => true) });
    await expect(CREATE.follow("user_1", "user_2", repo)).rejects.toMatchObject({ status: 404 });
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});

describe("CREATE.friend_request", () => {
  it("creates a pending request when there is no incoming one", async () => {
    const repo = createFakeRepo();
    const result = await CREATE.friend_request("user_1", "user_2", repo);
    expect(repo.upsert).toHaveBeenCalledWith("user_1", "user_2", "friend_request", "pending");
    expect(result).toBeUndefined();
  });

  it("cross-accepts when the target already requested us", async () => {
    const repo = createFakeRepo({
      find: vi.fn(async (from: string) => (from === "user_2" ? { status: "pending" } : null)),
    });
    const result = await CREATE.friend_request("user_1", "user_2", repo);
    expect(repo.upsert).toHaveBeenCalledWith("user_2", "user_1", "friend_request", "accepted");
    expect(repo.becomeFriends).toHaveBeenCalledWith("user_1", "user_2");
    expect(result).toEqual({ autoAccepted: true });
  });

  it("rejects self-requests and blocked targets", async () => {
    const selfRepo = createFakeRepo();
    await expect(CREATE.friend_request("user_1", "user_1", selfRepo)).rejects.toMatchObject({
      status: 400,
    });

    const blockedRepo = createFakeRepo({ isBlocked: vi.fn(async () => true) });
    await expect(CREATE.friend_request("user_1", "user_2", blockedRepo)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("CREATE.block", () => {
  it("removes the viewer's follow, keeps the blocked user's follow, stores the block", async () => {
    const repo = createFakeRepo();
    await CREATE.block("user_1", "user_2", repo);
    // The viewer stops following the blocked user (one-way delete).
    expect(repo.delete).toHaveBeenCalledWith("user_1", "user_2", "follow");
    // Only pending friend requests are cleared; the blocked user's follow
    // toward the viewer survives so they don't notice being blocked.
    expect(repo.clearBidirectional).toHaveBeenCalledWith("user_1", "user_2", ["friend_request"]);
    expect(repo.upsert).toHaveBeenCalledWith("user_1", "user_2", "block", "blocked");
  });
});

describe("REMOVE", () => {
  it("unfollows by deleting the follow edge", async () => {
    const repo = createFakeRepo();
    await REMOVE.follow("user_1", "user_2", repo);
    expect(repo.delete).toHaveBeenCalledWith("user_1", "user_2", "follow");
  });

  it("unfriends by clearing friendship + requests but keeping the follow", async () => {
    const repo = createFakeRepo();
    await REMOVE.friend("user_1", "user_2", repo);
    expect(repo.clearBidirectional).toHaveBeenCalledWith("user_1", "user_2", [
      "friend",
      "friend_request",
    ]);
  });

  it("unblocks by deleting the block edge", async () => {
    const repo = createFakeRepo();
    await REMOVE.block("user_1", "user_2", repo);
    expect(repo.delete).toHaveBeenCalledWith("user_1", "user_2", "block");
  });
});

describe("UPDATE.friend_request (accept)", () => {
  it("accepts the pending request and becomes friends", async () => {
    const repo = createFakeRepo({
      find: vi.fn(async () => ({ status: "pending" })),
    });
    await UPDATE.friend_request("user_1", "user_2", repo);
    expect(repo.upsert).toHaveBeenCalledWith("user_2", "user_1", "friend_request", "accepted");
    expect(repo.becomeFriends).toHaveBeenCalledWith("user_1", "user_2");
  });

  it("returns 404 when there is no pending request", async () => {
    const repo = createFakeRepo({ find: vi.fn(async () => null) });
    await expect(UPDATE.friend_request("user_1", "user_2", repo)).rejects.toMatchObject({
      status: 404,
    });
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("returns 404 when the sender blocked us", async () => {
    const repo = createFakeRepo({ isBlocked: vi.fn(async () => true) });
    await expect(UPDATE.friend_request("user_1", "user_2", repo)).rejects.toMatchObject({
      status: 404,
    });
  });
});
