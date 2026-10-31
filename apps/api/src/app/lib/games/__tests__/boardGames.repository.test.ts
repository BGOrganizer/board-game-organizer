import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardGamesRepository } from "@/app/lib/games/boardGames.repository";

const dbMock = { collection: vi.fn() };
const colMock = {
  bulkWrite: vi.fn(async (_ops: unknown) => ({ upsertedCount: 1, modifiedCount: 0 })),
  countDocuments: vi.fn(async () => 42),
  updateMany: vi.fn(async () => ({ modifiedCount: 42 })),
  estimatedDocumentCount: vi.fn(async () => 42),
  find: vi.fn(() => ({ toArray: vi.fn(async () => [{ id: 342942 }, { id: 174430 }]) })),
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
      {
        id: 342942,
        name: "Cascadia",
        yearPublished: 2021,
        rank: 0,
        bayesAverage: 8.1,
        average: 8.3,
        usersRated: 500,
        isExpansion: false,
        abstractsRank: null,
      },
      { id: 174430, name: "Gloomhaven", yearPublished: null },
    ]);
    expect(n).toBe(1);
    const ops = colMock.bulkWrite.mock.calls[0][0] as Array<{
      updateOne: {
        filter: { id: number };
        update: { $set: { name: string }; $unset: { thumbnail: string } };
        upsert: boolean;
      };
    }>;
    expect(ops).toHaveLength(2);
    expect(ops[0].updateOne.filter).toEqual({ id: 342942 });
    expect(ops[0].updateOne.update.$set).toMatchObject({
      name: "Cascadia",
      rank: 0,
      bayesAverage: 8.1,
      average: 8.3,
      usersRated: 500,
      isExpansion: false,
      abstractsRank: null,
    });
    expect(ops[1].updateOne.update.$set).toMatchObject({ yearPublished: null });
    expect(ops[0].updateOne.update.$unset).toEqual({ thumbnail: "" });
    expect(ops[0].updateOne.upsert).toBe(true);
    expect(colMock.bulkWrite).toHaveBeenCalledWith(ops, { ordered: false });
  });

  it("returns zero for an empty batch", async () => {
    expect(await repo().bulkUpsert([])).toBe(0);
    expect(colMock.bulkWrite).not.toHaveBeenCalled();
  });

  it("clears legacy thumbnails from remaining catalog entries", async () => {
    expect(await repo().removeLegacyThumbnails()).toBe(42);
    expect(colMock.updateMany).toHaveBeenCalledWith(
      { thumbnail: { $exists: true } },
      { $unset: { thumbnail: "" } },
      {},
    );
  });

  it("counts documents", async () => {
    expect(await repo().count()).toBe(42);
    expect(colMock.estimatedDocumentCount).toHaveBeenCalledWith({});
  });

  it("finds existing ids using a transaction session", async () => {
    const session = { id: "session" };
    const repository = new BoardGamesRepository(dbMock as never, session as never);
    await expect(repository.findExistingIds([342942, 174430])).resolves.toEqual([342942, 174430]);
    expect(colMock.find).toHaveBeenCalledWith(
      { id: { $in: [342942, 174430] } },
      { projection: { _id: 0, id: 1 }, session },
    );
  });

  it("returns selected game details", async () => {
    await expect(repo().findByIds([342942, 174430])).resolves.toEqual([
      { id: 342942 },
      { id: 174430 },
    ]);
    expect(colMock.find).toHaveBeenCalledWith(
      { id: { $in: [342942, 174430] } },
      { projection: { _id: 0 } },
    );
  });
});
