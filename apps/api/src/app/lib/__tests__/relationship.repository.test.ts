import { describe, expect, it, vi } from "vitest";
import { RelationshipRepository } from "../relationship.repository";

/**
 * Fakes the MongoDB collection surface used by the repository with a plain
 * object, recording every call.
 */
function createFakeCol(overrides: Record<string, unknown> = {}) {
  const calls: unknown[] = [];
  const col = {
    calls,
    findOne: vi.fn(async () => null),
    findOneAndUpdate: vi.fn(async () => ({ value: null })),
    deleteOne: vi.fn(async () => ({ deletedCount: 0 })),
    countDocuments: vi.fn(async () => 0),
    find: vi.fn(() => ({ toArray: async () => [] })),
    ...overrides,
  };
  return { col, calls };
}

function createRepo(col: ReturnType<typeof createFakeCol>["col"]) {
  return new RelationshipRepository({ collection: () => col } as never);
}

describe("RelationshipRepository", () => {
  it("find delegates to the collection with the domain shape", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.find("user_1", "user_2", "follow");
    expect(col.findOne).toHaveBeenCalledWith(
      { fromUserId: "user_1", toUserId: "user_2", type: "follow" },
      {},
    );
  });

  it("upsert performs an upsert and returns the updated document", async () => {
    const doc = { _id: "1", status: "accepted" };
    const { col } = createFakeCol({
      findOneAndUpdate: vi.fn(async () => doc),
    });
    const repo = createRepo(col);
    const result = await repo.upsert("user_1", "user_2", "follow", "accepted");
    expect(result).toBe(doc);
    expect(col.findOneAndUpdate).toHaveBeenCalledWith(
      { fromUserId: "user_1", toUserId: "user_2", type: "follow" },
      expect.objectContaining({ $set: { status: "accepted", updatedAt: expect.any(Date) } }),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("delete removes the relationship edge", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.delete("user_1", "user_2", "follow");
    expect(col.deleteOne).toHaveBeenCalledWith(
      { fromUserId: "user_1", toUserId: "user_2", type: "follow" },
      {},
    );
  });

  it("isBlocked checks both directions", async () => {
    const { col } = createFakeCol({ countDocuments: vi.fn(async () => 1) });
    const repo = createRepo(col);
    expect(await repo.isBlocked("user_1", "user_2")).toBe(true);
    expect(col.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "block",
        $or: [
          { fromUserId: "user_1", toUserId: "user_2" },
          { fromUserId: "user_2", toUserId: "user_1" },
        ],
      }),
      {},
    );
  });

  it("getBlockedUserIds returns both directions, normalized to the other side", async () => {
    const { col } = createFakeCol({
      find: vi.fn(() => ({
        toArray: async () => [
          { fromUserId: "me", toUserId: "them" },
          { fromUserId: "other", toUserId: "me" },
        ],
      })),
    });
    const repo = createRepo(col);
    const ids = await repo.getBlockedUserIds("me");
    expect(ids.sort()).toEqual(["other", "them"]);
  });

  it("list excludes blocked users via $nin", async () => {
    const { col } = createFakeCol({
      find: vi.fn((filter: { $or?: unknown[] }) => ({
        toArray: async () =>
          filter.$or ? [{ fromUserId: "me", toUserId: "blocked_1" }] : [{ toUserId: "friend_1" }],
      })),
    });
    const repo = createRepo(col);
    const rows = await repo.list("me", "friend", "accepted", "from");
    expect(rows).toHaveLength(1);
    expect(col.find).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromUserId: "me",
        type: "friend",
        status: "accepted",
        toUserId: { $nin: ["blocked_1"] },
      }),
      {},
    );
  });

  it("clearBidirectional deletes both directions", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.clearBidirectional("a", "b", ["follow", "friend"]);
    expect(col.deleteOne).toHaveBeenCalledTimes(4);
  });

  it("becomeFriends upserts the friendship and follow pairs", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.becomeFriends("a", "b");
    expect(col.findOneAndUpdate).toHaveBeenCalledTimes(4);
  });
});
