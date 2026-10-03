import { describe, expect, it, vi } from "vitest";
import { UsersRepository } from "../users.repository";

function createFakeCol(overrides: Record<string, unknown> = {}) {
  const calls: unknown[] = [];
  const col = {
    calls,
    findOne: vi.fn(async () => null),
    find: vi.fn(() => ({ toArray: vi.fn(async () => [{ clerkId: "user_1" }]) })),
    findOneAndUpdate: vi.fn(async () => ({ value: null })),
    deleteOne: vi.fn(async () => ({ deletedCount: 0 })),
    ...overrides,
  };
  return { col, calls };
}

function createRepo(col: ReturnType<typeof createFakeCol>["col"], session?: unknown) {
  return new UsersRepository({ collection: () => col } as never, session as never);
}

describe("UsersRepository", () => {
  it("upsertFromClerk upserts on clerkId and returns the updated document", async () => {
    const doc = { _id: "1", clerkId: "user_1" };
    const { col } = createFakeCol({ findOneAndUpdate: vi.fn(async () => ({ value: doc })) });
    const repo = createRepo(col);
    const result = await repo.upsertFromClerk({
      id: "user_1",
      email: "a@b.it",
      name: "Alessandro Mancini",
      avatarUrl: "https://example.com/avatar.png",
      mobileNumber: "+39 333 123 4567",
      preferredLanguage: "it",
      plan: "pro",
      e2e: false,
    });
    expect(result).toEqual({ value: doc });
    expect(col.findOneAndUpdate).toHaveBeenCalledWith(
      { clerkId: "user_1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          email: "a@b.it",
          name: "Alessandro Mancini",
          avatarUrl: "https://example.com/avatar.png",
          mobileNumber: "+39 333 123 4567",
          mobileNumberNormalized: "393331234567",
          plan: "pro",
          e2e: false,
        }),
      }),
      expect.objectContaining({ upsert: true, returnDocument: "after" }),
    );
  });

  it("sets plan default, presence and createdAt on insert", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.upsertFromClerk({
      id: "user_2",
      email: "x@y.it",
      name: "X",
      mobileNumber: "not-formatted",
      preferredLanguage: "en",
    });
    const [, update] = col.findOneAndUpdate.mock.calls[0] as unknown as [
      { clerkId?: string },
      {
        $set: Record<string, unknown>;
        $unset?: Record<string, unknown>;
        $setOnInsert: Record<string, unknown>;
      },
    ];
    expect(update.$set.plan).toBe("free");
    expect(update.$unset).toEqual({ mobileNumberNormalized: "" });
    expect(update.$setOnInsert.presence).toEqual({ online: false, lastActiveAt: expect.any(Date) });
    expect(update.$setOnInsert.createdAt).toBeInstanceOf(Date);
    expect(update.$setOnInsert.clerkId).toBe("user_2");
  });

  it("clears removed mobile metadata", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.upsertFromClerk({
      id: "user_3",
      email: "z@y.it",
      name: "Z",
      mobileNumber: null,
      preferredLanguage: "en",
    });

    expect(col.findOneAndUpdate).toHaveBeenCalledWith(
      { clerkId: "user_3" },
      expect.objectContaining({
        $unset: { mobileNumber: "", mobileNumberNormalized: "" },
      }),
      expect.any(Object),
    );
  });

  it("find methods query without a session", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.findById("user_1");
    await expect(repo.findByIds(["user_1"])).resolves.toEqual([{ clerkId: "user_1" }]);
    await repo.findByEmail("a@b.it");
    expect(col.findOne).toHaveBeenNthCalledWith(1, { clerkId: "user_1" }, {});
    expect(col.find).toHaveBeenCalledWith(
      { clerkId: { $in: ["user_1"] } },
      { projection: { _id: 0 } },
    );
    expect(col.findOne).toHaveBeenNthCalledWith(2, { email: "a@b.it" }, {});
  });

  it("deleteByClerkId deletes by clerkId", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.deleteByClerkId("user_1");
    expect(col.deleteOne).toHaveBeenCalledWith({ clerkId: "user_1" }, {});
  });

  it("passes a transaction session to every operation", async () => {
    const { col } = createFakeCol();
    const session = { id: "session" };
    const repo = createRepo(col, session);
    await repo.upsertFromClerk({
      id: "user_1",
      email: "a@b.it",
      name: "A",
      preferredLanguage: "en",
    });
    await repo.findById("user_1");
    await repo.findByIds(["user_1"]);
    await repo.findByEmail("a@b.it");
    await repo.deleteByClerkId("user_1");

    expect(col.findOneAndUpdate).toHaveBeenCalledWith(
      { clerkId: "user_1" },
      expect.any(Object),
      expect.objectContaining({ session }),
    );
    expect(col.findOne).toHaveBeenNthCalledWith(1, { clerkId: "user_1" }, { session });
    expect(col.find).toHaveBeenCalledWith(
      { clerkId: { $in: ["user_1"] } },
      { projection: { _id: 0 }, session },
    );
    expect(col.findOne).toHaveBeenNthCalledWith(2, { email: "a@b.it" }, { session });
    expect(col.deleteOne).toHaveBeenCalledWith({ clerkId: "user_1" }, { session });
  });
});
