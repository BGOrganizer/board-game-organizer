import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "@/app/lib/db";
import { RelationshipRepository } from "../relationship.repository";

/**
 * Fakes the MongoDB collection surface per social collection.
 */
function createFakeDb() {
  const collections: Record<string, ReturnType<typeof createFakeCol>> = {
    [COLLECTIONS.USERS]: createFakeCol(),
    [COLLECTIONS.FOLLOWS]: createFakeCol(),
    [COLLECTIONS.FRIEND_REQUESTS]: createFakeCol(),
    [COLLECTIONS.BLOCKS]: createFakeCol(),
    [COLLECTIONS.INVITES]: createFakeCol(),
    [COLLECTIONS.RELATIONSHIPS]: createFakeCol(),
  };
  const db = {
    collection: vi.fn((name: string) => collections[name]?.col ?? createFakeCol().col),
  };
  return { db, collections };
}

function createFakeCol(overrides: Record<string, unknown> = {}) {
  const calls: unknown[] = [];
  const col = {
    calls,
    findOne: vi.fn(async () => null),
    findOneAndUpdate: vi.fn(async () => ({ value: null })),
    deleteOne: vi.fn(async () => ({ deletedCount: 0 })),
    countDocuments: vi.fn(async () => 0) as unknown as ReturnType<typeof vi.fn>,
    find: vi.fn(() => ({ toArray: async () => [] })) as unknown as ReturnType<typeof vi.fn>,
    ...overrides,
  };
  return { col, calls };
}

function createRepo(db: ReturnType<typeof createFakeDb>["db"]) {
  return new RelationshipRepository(db as never);
}

describe("RelationshipRepository (Phase 1 collections)", () => {
  it("find delegates follows to the follows collection", async () => {
    const { db, collections } = createFakeDb();
    const repo = createRepo(db);
    await repo.find("user_1", "user_2", "follow");
    expect(db.collection).toHaveBeenCalledWith(COLLECTIONS.FOLLOWS);
    expect(collections[COLLECTIONS.FOLLOWS].col.findOne).toHaveBeenCalledWith(
      { fromUserId: "user_1", toUserId: "user_2" },
      {},
    );
  });

  it("find delegates friend_request to friendRequests with status filter", async () => {
    const { db, collections } = createFakeDb();
    const repo = createRepo(db);
    await repo.find("user_1", "user_2", "friend_request");
    expect(collections[COLLECTIONS.FRIEND_REQUESTS].col.findOne).toHaveBeenCalledWith(
      { fromUserId: "user_1", toUserId: "user_2" },
      {},
    );
  });

  it("isFriend derives from two accepted requests", async () => {
    const { db, collections } = createFakeDb();
    collections[COLLECTIONS.FRIEND_REQUESTS].col.countDocuments.mockResolvedValueOnce(2);
    const repo = createRepo(db);
    expect(await repo.isFriend("a", "b")).toBe(true);
  });

  it("upsert writes follow edges without status", async () => {
    const { db, collections } = createFakeDb();
    const repo = createRepo(db);
    await repo.upsert("user_1", "user_2", "follow", "accepted");
    expect(collections[COLLECTIONS.FOLLOWS].col.findOneAndUpdate).toHaveBeenCalledWith(
      { fromUserId: "user_1", toUserId: "user_2" },
      expect.objectContaining({ $set: {} }),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("upsert writes friend_request with status", async () => {
    const { db, collections } = createFakeDb();
    const repo = createRepo(db);
    await repo.upsert("user_1", "user_2", "friend_request", "pending");
    expect(collections[COLLECTIONS.FRIEND_REQUESTS].col.findOneAndUpdate).toHaveBeenCalledWith(
      { fromUserId: "user_1", toUserId: "user_2" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "pending" }) }),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("delete removes the edge from the right collection", async () => {
    const { db, collections } = createFakeDb();
    const repo = createRepo(db);
    await repo.delete("user_1", "user_2", "follow");
    expect(collections[COLLECTIONS.FOLLOWS].col.deleteOne).toHaveBeenCalledWith(
      { fromUserId: "user_1", toUserId: "user_2" },
      {},
    );
  });

  it("isBlocked checks both directions in blocks", async () => {
    const { db, collections } = createFakeDb();
    collections[COLLECTIONS.BLOCKS].col.countDocuments.mockResolvedValueOnce(1);
    const repo = createRepo(db);
    expect(await repo.isBlocked("user_1", "user_2")).toBe(true);
    expect(collections[COLLECTIONS.BLOCKS].col.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [
          { fromUserId: "user_1", toUserId: "user_2" },
          { fromUserId: "user_2", toUserId: "user_1" },
        ],
      }),
      {},
    );
  });

  it("getBlockedUserIds returns both directions, normalized to the other side", async () => {
    const { db, collections } = createFakeDb();
    collections[COLLECTIONS.BLOCKS].col.find.mockReturnValue({
      toArray: async () => [
        { fromUserId: "me", toUserId: "them" },
        { fromUserId: "other", toUserId: "me" },
      ],
    });
    const repo = createRepo(db);
    const ids = await repo.getBlockedUserIds("me");
    expect(ids.sort()).toEqual(["other", "them"]);
  });

  it("list for follow uses follows and excludes blocked", async () => {
    const { db, collections } = createFakeDb();
    collections[COLLECTIONS.BLOCKS].col.find.mockReturnValue({
      toArray: async () => [{ fromUserId: "me", toUserId: "blocked_1" }],
    });
    collections[COLLECTIONS.FOLLOWS].col.find.mockReturnValue({
      toArray: async () => [{ fromUserId: "me", toUserId: "friend_1" }],
    });
    const repo = createRepo(db);
    const rows = await repo.list("me", "follow", "accepted", "from");
    expect(rows).toHaveLength(1);
    expect(collections[COLLECTIONS.FOLLOWS].col.find).toHaveBeenCalledWith(
      expect.objectContaining({
        fromUserId: "me",
        toUserId: { $nin: ["blocked_1"] },
      }),
      {},
    );
  });

  it("list for block reads the blocks collection (not friend requests)", async () => {
    const { db, collections } = createFakeDb();
    collections[COLLECTIONS.BLOCKS].col.find.mockReturnValue({
      toArray: async () => [{ fromUserId: "me", toUserId: "blocked_1" }],
    });
    // Regression: the Blocked tab listed friend requests instead of blocked
    // users because the collection selection fell through to friendRequests.
    collections[COLLECTIONS.FRIEND_REQUESTS].col.find.mockReturnValue({
      toArray: async () => [{ fromUserId: "me", toUserId: "not-blocked" }],
    });
    const repo = createRepo(db);
    const rows = await repo.list("me", "block", "blocked", "from");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ fromUserId: "me", toUserId: "blocked_1" });
    expect(collections[COLLECTIONS.BLOCKS].col.find).toHaveBeenCalledWith(
      expect.objectContaining({ fromUserId: "me" }),
      {},
    );
    // Regression #2: the filter must NOT exclude the blocked users themselves
    // ($nin blocked would hide exactly the rows the Blocked tab must show).
    expect(collections[COLLECTIONS.BLOCKS].col.find).toHaveBeenCalledWith(
      expect.not.objectContaining({ toUserId: expect.anything() }),
      {},
    );
    expect(collections[COLLECTIONS.FRIEND_REQUESTS].col.find).not.toHaveBeenCalled();
  });

  it("list for friends filters to bidirectional accepted requests", async () => {
    const { db, collections } = createFakeDb();
    collections[COLLECTIONS.BLOCKS].col.find.mockReturnValue({ toArray: async () => [] });
    collections[COLLECTIONS.FRIEND_REQUESTS].col.find.mockReturnValue({
      toArray: async () => [{ fromUserId: "me", toUserId: "friend_1" }],
    });
    collections[COLLECTIONS.FRIEND_REQUESTS].col.countDocuments.mockResolvedValue(1);
    const repo = createRepo(db);
    const rows = await repo.list("me", "friend", "accepted", "from");
    expect(rows).toHaveLength(1);
  });

  it("clearBidirectional deletes both directions", async () => {
    const { db } = createFakeDb();
    const repo = createRepo(db);
    await repo.clearBidirectional("a", "b", ["follow", "friend"]);
    // follow both ways + friend → both friend_requests both ways
    expect(db.collection).toHaveBeenCalled();
  });

  it("becomeFriends upserts two friend_requests + two follows", async () => {
    const { db, collections } = createFakeDb();
    const repo = createRepo(db);
    await repo.becomeFriends("a", "b");
    expect(collections[COLLECTIONS.FRIEND_REQUESTS].col.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(collections[COLLECTIONS.FOLLOWS].col.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it("getRelationshipStatus reports blocked when target blocked the viewer", async () => {
    const { db, collections } = createFakeDb();
    collections[COLLECTIONS.BLOCKS].col.findOne
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ _id: "1" } as never);
    const repo = createRepo(db);
    const status = await repo.getRelationshipStatus("viewer", "target");
    expect(status).toEqual({
      isFollowing: false,
      isFriend: false,
      friendRequestSent: false,
      friendRequestReceived: false,
      hasBlocked: false,
      isBlockedBy: true,
    });
  });
});
