import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardGamesRepository } from "@/app/lib/boardGames.repository";

const dbMock = { collection: vi.fn() };
const colMock = {
  bulkWrite: vi.fn(async (ops: unknown) => ({ upsertedCount: 1, modifiedCount: 0 })),
  countDocuments: vi.fn(async () => 42),
};
dbMock.collection.mockReturnValue(colMock);

function repo() {
  return new BoardGamesRepository(dbMock as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BoardGamesRepository", () => {
  it("bulk upserts games keyed by BGG id", async () => {
    const n = await repo().bulkUpsert([
      { id: 342942, name: "Cascadia", yearPublished: 2021, thumbnail: "https://x/img.jpg" },
      { id: 174430, name: "Gloomhaven", yearPublished: 2017, thumbnail: null },
    ]);
    expect(n).toBe(1);
    const ops = colMock.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops[0].updateOne.filter).toEqual({ id: 342942 });
    expect(ops[0].updateOne.update.$set.name).toBe("Cascadia");
    expect(ops[0].updateOne.upsert).toBe(true);
  });

  it("returns zero for an empty batch", async () => {
    expect(await repo().bulkUpsert([])).toBe(0);
    expect(colMock.bulkWrite).not.toHaveBeenCalled();
  });

  it("counts documents", async () => {
    expect(await repo().count()).toBe(42);
  });
});
