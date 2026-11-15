import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "../route";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  sort: vi.fn(),
  limit: vi.fn(),
  rows: [] as Array<{ id: number; name: string }>,
  hydrate: vi.fn(),
  databaseName: "catalog",
}));
vi.mock("@/app/lib/games/bgg", () => ({ hydrateGames: mocks.hydrate }));
vi.mock("@/app/lib/db", () => ({
  COLLECTIONS: { BOARD_GAMES: "games", BGG_QUOTA: "quota" },
  getDb: async () => ({
    databaseName: mocks.databaseName,
    collection: (name: string) => {
      if (name === "quota")
        return { findOne: async () => ({ nextAt: new Date(Date.now() + 60000) }) };
      const cursor = {
        sort: (value: unknown) => {
          mocks.sort(value);
          return cursor;
        },
        limit: (value: number) => {
          mocks.limit(value);
          return cursor;
        },
        toArray: async () => mocks.rows,
      };
      return {
        find: (filter: unknown) => {
          mocks.find(filter);
          return cursor;
        },
      };
    },
  }),
}));
const request = (body: unknown, token = "secret") =>
  new Request("https://api.test/api/admin/import-games/enrich", {
    method: "POST",
    headers: { authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("CLERK_SECRET_KEY", "secret");
  vi.clearAllMocks();
  mocks.databaseName = "catalog";
  mocks.rows = Array.from({ length: 43 }, (_, index) => ({ id: index + 1, name: "Game" }));
});
afterEach(() => vi.unstubAllEnvs());
it("requires importer authorization and rejects invalid offset or CI targets before hydration", async () => {
  expect((await POST(request({ offset: 0 }, "wrong"))).status).toBe(401);
  expect((await POST(request({ offset: 200 }))).status).toBe(400);
  mocks.databaseName = "bgo_ci_test";
  expect((await POST(request({ offset: 0 }))).status).toBe(409);
  expect(mocks.hydrate).not.toHaveBeenCalled();
});
it("selects ranked base games at source and hydrates just one bounded batch with explicit incomplete/backoff receipt", async () => {
  const response = await POST(request({ offset: 20 }));
  expect(mocks.find).toHaveBeenCalledWith({
    isExpansion: false,
    rank: { $gt: 0 },
    $expr: { $eq: [{ $mod: ["$rank", 1] }, 0] },
  });
  expect(mocks.sort).toHaveBeenCalledWith({ rank: 1, id: 1 });
  expect(mocks.limit).toHaveBeenCalledWith(200);
  expect(mocks.hydrate.mock.calls[0][1].map((row: { id: number }) => row.id)).toEqual(
    Array.from({ length: 20 }, (_, index) => index + 21),
  );
  expect(await response.json()).toMatchObject({
    count: 20,
    recovered: 0,
    skipped: 0,
    incomplete: 20,
    nextOffset: 40,
    retryAfterMs: expect.any(Number),
  });
});
