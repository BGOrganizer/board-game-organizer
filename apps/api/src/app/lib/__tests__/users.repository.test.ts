import { describe, expect, it, vi } from "vitest";
import { UsersRepository } from "../users.repository";

function createFakeCol(overrides: Record<string, unknown> = {}) {
  const calls: unknown[] = [];
  const col = {
    calls,
    findOne: vi.fn(async () => null),
    findOneAndUpdate: vi.fn(async () => ({ value: null })),
    deleteOne: vi.fn(async () => ({ deletedCount: 0 })),
    ...overrides,
  };
  return { col, calls };
}

function createRepo(col: ReturnType<typeof createFakeCol>["col"]) {
  return new UsersRepository({ collection: () => col } as never);
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
      preferredLanguage: "it",
    });
    expect(result).toEqual({ value: doc });
    expect(col.findOneAndUpdate).toHaveBeenCalledWith(
      { clerkId: "user_1" },
      expect.objectContaining({
        $set: expect.objectContaining({ email: "a@b.it", name: "Alessandro Mancini" }),
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
      preferredLanguage: "en",
    });
    const [, update] = col.findOneAndUpdate.mock.calls[0] as unknown as [
      { clerkId?: string },
      { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> },
    ];
    expect(update.$set.plan).toBe("free");
    expect(update.$setOnInsert.presence).toEqual({ online: false, lastActiveAt: expect.any(Date) });
    expect(update.$setOnInsert.createdAt).toBeInstanceOf(Date);
    expect(update.$setOnInsert.clerkId).toBe("user_2");
  });

  it("findById queries by clerkId", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.findById("user_1");
    expect(col.findOne).toHaveBeenCalledWith({ clerkId: "user_1" });
  });

  it("deleteByClerkId deletes by clerkId", async () => {
    const { col } = createFakeCol();
    const repo = createRepo(col);
    await repo.deleteByClerkId("user_1");
    expect(col.deleteOne).toHaveBeenCalledWith({ clerkId: "user_1" });
  });
});
