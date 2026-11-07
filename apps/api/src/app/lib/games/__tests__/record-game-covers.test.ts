import type { Db } from "mongodb";
import { beforeEach, expect, it, vi } from "vitest";
import { enrichRecordGameCovers } from "../record-game-covers";

const find = vi.hoisted(() => vi.fn());
vi.mock("../boardGames.repository", () => ({
  BoardGamesRepository: class {
    findByIds = find;
  },
}));
beforeEach(() => find.mockReset());
it("does nothing for absent or already complete authorized presentation fields", async () => {
  for (const value of [
    null,
    42,
    {},
    { gamesDetail: [{ id: 1, imageUrl: "https://image.test/known.png" }] },
  ])
    await enrichRecordGameCovers({} as Db, value);
  expect(find).not.toHaveBeenCalled();
});
it("enriches table/detail/grouped proposal shapes once, retaining covers and missing-data fallback", async () => {
  const a = { id: 1, imageUrl: null },
    b = { id: 2, imageUrl: "https://image.test/known.png" },
    c = { id: 3, imageUrl: null },
    d = { id: 4, imageUrl: null },
    e = { id: 5, imageUrl: null };
  const value = {
    gamesDetail: [a, b],
    items: [{ game: c }, { gamesDetail: [a] }],
    proposal: { game: d },
    proposals: [{ game: e }],
  };
  find.mockResolvedValue([
    { id: 1, image: "https://image.test/one.png" },
    { id: 3 },
    { id: 4, image: "https://image.test/four.png" },
  ]);
  await enrichRecordGameCovers({} as Db, value);
  expect(find).toHaveBeenCalledExactlyOnceWith([1, 3, 5, 4]);
  expect(a.imageUrl).toBe("https://image.test/one.png");
  expect(b.imageUrl).toBe("https://image.test/known.png");
  expect(c.imageUrl).toBeNull();
  expect(d.imageUrl).toBe("https://image.test/four.png");
  expect(e.imageUrl).toBeNull();
});
