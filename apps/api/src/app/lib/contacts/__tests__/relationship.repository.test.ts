import { beforeEach, describe, expect, it, vi } from "vitest";
import { RelationshipRepository } from "../relationship.repository";

function setup(rows: Record<string, Array<Record<string, unknown>>> = {}) {
  const collections = new Map<string, ReturnType<typeof makeCollection>>();
  function makeCollection(name: string) {
    const cursor = {
      sort: vi.fn(function sort() {
        return cursor;
      }),
      toArray: vi.fn(async () => rows[name] ?? []),
    };
    return {
      countDocuments: vi.fn(async () => 0),
      findOne: vi.fn(async () => null),
      findOneAndUpdate: vi.fn(async () => null),
      updateOne: vi.fn(async () => ({ acknowledged: true })),
      deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
      deleteMany: vi.fn(async () => ({ deletedCount: 2 })),
      find: vi.fn(() => cursor),
      cursor,
    };
  }
  const db = {
    collection: vi.fn((name: string) => {
      if (!collections.has(name)) collections.set(name, makeCollection(name));
      return collections.get(name);
    }),
  };
  return {
    db,
    col(name: string) {
      db.collection(name);
      const collection = collections.get(name);
      if (!collection) throw new Error(`Missing mock collection: ${name}`);
      return collection;
    },
  };
}

describe("RelationshipRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checks synchronized users with and without a session", async () => {
    const fake = setup();
    fake.col("users").countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const session = { id: "session" };
    await expect(
      new RelationshipRepository(fake.db as never, session as never).userExists("a"),
    ).resolves.toBe(true);
    await expect(new RelationshipRepository(fake.db as never).userExists("b")).resolves.toBe(false);
    expect(fake.col("users").countDocuments).toHaveBeenNthCalledWith(
      1,
      { clerkId: "a" },
      { session },
    );
  });

  it("creates idempotent follows and removes them", async () => {
    const fake = setup();
    const repo = new RelationshipRepository(fake.db as never);
    await repo.follow("a", "b");
    await repo.unfollow("a", "b");
    expect(fake.col("follows").updateOne).toHaveBeenCalledWith(
      { fromUserId: "a", toUserId: "b" },
      { $setOnInsert: expect.objectContaining({ fromUserId: "a", toUserId: "b" }) },
      { upsert: true },
    );
    expect(fake.col("follows").deleteOne).toHaveBeenCalledWith(
      { fromUserId: "a", toUserId: "b" },
      {},
    );
  });

  it("finds, creates, responds to, and deletes friend requests", async () => {
    const fake = setup();
    const repo = new RelationshipRepository(fake.db as never);
    await repo.findFriendRequest("a", "b");
    await repo.setFriendRequest("a", "b", "pending");
    await repo.setFriendRequest("a", "b", "accepted");
    await repo.deleteFriendRequest("a", "b", "pending");
    await repo.deleteFriendRequest("a", "b");
    await repo.clearFriendRequests("a", "b");

    expect(fake.col("friendRequests").findOne).toHaveBeenCalledWith(
      { fromUserId: "a", toUserId: "b" },
      {},
    );
    expect(fake.col("friendRequests").findOneAndUpdate).toHaveBeenNthCalledWith(
      1,
      { fromUserId: "a", toUserId: "b" },
      expect.objectContaining({ $unset: { respondedAt: "" } }),
      expect.objectContaining({ upsert: true }),
    );
    expect(fake.col("friendRequests").findOneAndUpdate).toHaveBeenNthCalledWith(
      2,
      { fromUserId: "a", toUserId: "b" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "accepted", respondedAt: expect.any(Date) }),
      }),
      expect.objectContaining({ upsert: true }),
    );
    expect(fake.col("friendRequests").deleteOne).toHaveBeenNthCalledWith(
      1,
      { fromUserId: "a", toUserId: "b", status: "pending" },
      {},
    );
    expect(fake.col("friendRequests").deleteOne).toHaveBeenNthCalledWith(
      2,
      { fromUserId: "a", toUserId: "b" },
      {},
    );
    expect(fake.col("friendRequests").deleteMany).toHaveBeenCalled();
  });

  it("creates and removes friendship records while preserving follows on unfriend", async () => {
    const fake = setup();
    const repo = new RelationshipRepository(fake.db as never);
    const calls: string[] = [];
    vi.spyOn(repo, "setFriendRequest").mockImplementation(async (from, to) => {
      calls.push(`request:${from}:${to}`);
      return null;
    });
    vi.spyOn(repo, "follow").mockImplementation(async (from, to) => {
      calls.push(`follow:${from}:${to}`);
      return {} as never;
    });

    await repo.becomeFriends("a", "b");
    await repo.unfriend("a", "b");
    expect(calls).toEqual(["request:a:b", "request:b:a", "follow:a:b", "follow:b:a"]);
    expect(fake.col("friendRequests").deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted" }),
      {},
    );
  });

  it("detects complete and incomplete friendships", async () => {
    const fake = setup();
    fake.col("friendRequests").countDocuments.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const repo = new RelationshipRepository(fake.db as never);
    await expect(repo.isFriend("a", "b")).resolves.toBe(true);
    await expect(repo.isFriend("a", "b")).resolves.toBe(false);
  });

  it("creates, finds, removes, and detects blocks", async () => {
    const fake = setup();
    fake.col("blocks").countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const repo = new RelationshipRepository(fake.db as never);
    await repo.findBlock("a", "b");
    await repo.block("a", "b");
    await repo.unblock("a", "b");
    await expect(repo.isBlocked("a", "b")).resolves.toBe(true);
    await expect(repo.isBlocked("a", "b")).resolves.toBe(false);
    expect(fake.col("blocks").updateOne).toHaveBeenCalledWith(
      { fromUserId: "a", toUserId: "b" },
      { $setOnInsert: expect.objectContaining({ fromUserId: "a", toUserId: "b" }) },
      { upsert: true },
    );
  });

  it("deletes every social edge for a removed user", async () => {
    const fake = setup();
    await new RelationshipRepository(fake.db as never).deleteAllForUser("a");
    const filter = { $or: [{ fromUserId: "a" }, { toUserId: "a" }] };
    expect(fake.col("follows").deleteMany).toHaveBeenCalledWith(filter, {});
    expect(fake.col("friendRequests").deleteMany).toHaveBeenCalledWith(filter, {});
    expect(fake.col("blocks").deleteMany).toHaveBeenCalledWith(filter, {});
  });

  it("returns both directions of blocked user ids", async () => {
    const fake = setup({
      blocks: [
        { fromUserId: "a", toUserId: "b" },
        { fromUserId: "c", toUserId: "a" },
      ],
    });
    await expect(
      new RelationshipRepository(fake.db as never).getBlockedUserIds("a"),
    ).resolves.toEqual(["b", "c"]);
  });

  it("lists following and followers with excluded users", async () => {
    const fake = setup();
    const repo = new RelationshipRepository(fake.db as never);
    await repo.listFollowing("a", ["x"]);
    await repo.listFollowers("a");
    expect(fake.col("follows").find).toHaveBeenNthCalledWith(
      1,
      { fromUserId: "a", toUserId: { $nin: ["x"] } },
      { projection: { _id: 0 } },
    );
    expect(fake.col("follows").find).toHaveBeenNthCalledWith(
      2,
      { toUserId: "a", fromUserId: { $nin: [] } },
      { projection: { _id: 0 } },
    );
  });

  it("derives unique friends only from accepted pairs", async () => {
    const fake = setup({
      friendRequests: [
        { fromUserId: "a", toUserId: "b", status: "accepted" },
        { fromUserId: "b", toUserId: "a", status: "accepted" },
        { fromUserId: "a", toUserId: "c", status: "accepted" },
        { fromUserId: "a", toUserId: "hidden", status: "accepted" },
        { fromUserId: "hidden", toUserId: "a", status: "accepted" },
        { fromUserId: "a", toUserId: "a", status: "accepted" },
      ],
    });
    const rows = await new RelationshipRepository(fake.db as never).listFriends("a", ["hidden"]);
    expect(rows).toEqual([{ fromUserId: "a", toUserId: "b", status: "accepted" }]);
  });

  it("lists incoming, outgoing, and blocked relationships newest first", async () => {
    const fake = setup();
    const repo = new RelationshipRepository(fake.db as never);
    await repo.listIncomingFriendRequests("a", ["x"]);
    await repo.listOutgoingFriendRequests("a");
    await repo.listBlocked("a");
    expect(fake.col("friendRequests").find).toHaveBeenNthCalledWith(
      1,
      { toUserId: "a", fromUserId: { $nin: ["x"] }, status: "pending" },
      { projection: { _id: 0 } },
    );
    expect(fake.col("friendRequests").find).toHaveBeenNthCalledWith(
      2,
      { fromUserId: "a", toUserId: { $nin: [] }, status: "pending" },
      { projection: { _id: 0 } },
    );
    expect(fake.col("blocks").find).toHaveBeenCalledWith(
      { fromUserId: "a" },
      { projection: { _id: 0 } },
    );
    expect(fake.col("friendRequests").cursor.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(fake.col("blocks").cursor.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });
});
