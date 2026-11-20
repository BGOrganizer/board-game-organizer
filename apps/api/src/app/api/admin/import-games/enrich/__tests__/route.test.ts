import { type BoardGame, boardGameModel } from "@board-game-organizer/schemas";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "../route";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  sort: vi.fn(),
  limit: vi.fn(),
  rows: [] as BoardGame[],
  quota: null as { nextAt: Date } | null,
  hydrate: vi.fn(),
  databaseName: "catalog",
}));
vi.mock("@/app/lib/games/bgg", () => ({ hydrateGames: mocks.hydrate }));
vi.mock("@/app/lib/db", () => ({
  COLLECTIONS: { BOARD_GAMES: "games", BGG_QUOTA: "quota" },
  getDb: async () => ({
    databaseName: mocks.databaseName,
    collection: (name: string) => {
      if (name === "quota") return { findOne: async () => mocks.quota };
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
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("CLERK_SECRET_KEY", "secret");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.hydrate.mockReset().mockResolvedValue(undefined);
  mocks.quota = { nextAt: new Date(Date.now() + 60_000) };
  mocks.databaseName = "catalog";
  mocks.rows = Array.from({ length: 43 }, (_, index) => ({
    id: index + 1,
    name: "Game",
    rank: index + 1,
    isExpansion: false,
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
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

function freshGame(id: number): BoardGame {
  const checked = new Date().toISOString();
  return boardGameModel.parse({
    id,
    name: `Ranked game ${id}`,
    rank: id,
    isExpansion: false,
    image: "https://images.example.test/game.webp",
    minPlayers: 2,
    maxPlayers: 4,
    minPlayMinutes: 30,
    maxPlayMinutes: 60,
    averageWeight: 2.5,
    categories: [],
    categoriesCheckedAt: checked,
    playerCountsCheckedAt: checked,
    durationCheckedAt: checked,
    weightCheckedAt: checked,
    suggestedPlayers: {
      totalVotes: 3,
      rows: [
        { players: 4, orMore: false, best: 3, recommended: 0, notRecommended: 0, sampleCount: 3 },
      ],
      fetchedAt: checked,
    },
  });
}
it("rejects missing importer credentials and malformed JSON before querying or hydrating catalog data", async () => {
  vi.stubEnv("CLERK_SECRET_KEY", undefined);
  expect((await POST(request({ offset: 0 }))).status).toBe(401);
  vi.stubEnv("CLERK_SECRET_KEY", "secret");
  const malformed = new Request("https://api.test/api/admin/import-games/enrich", {
    method: "POST",
    headers: { authorization: "Bearer secret" },
    body: "not-json",
  });
  expect((await POST(malformed)).status).toBe(400);
  expect(mocks.find).not.toHaveBeenCalled();
  expect(mocks.hydrate).not.toHaveBeenCalled();
});
it("distinguishes complete fresh metadata from each missing metadata field and reports actual hydration recovery", async () => {
  const fields = [
    "image",
    "minPlayers",
    "maxPlayers",
    "minPlayMinutes",
    "maxPlayMinutes",
    "averageWeight",
    "categories",
    "categoriesCheckedAt",
    "suggestedPlayers",
  ] as const;
  mocks.rows = [
    freshGame(1),
    ...fields.map((field, index) => {
      const row = freshGame(index + 2);
      delete row[field];
      return boardGameModel.parse(row);
    }),
  ];
  mocks.hydrate.mockImplementationOnce(
    async (_db: unknown, rows: BoardGame[], durations: boolean) => {
      expect(durations).toBe(true);
      for (const row of rows) Object.assign(row, freshGame(row.id));
    },
  );
  const response = await POST(request({ offset: 0 }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    total: 10,
    count: 10,
    skipped: 1,
    recovered: 9,
    incomplete: 0,
    nextOffset: null,
    retryAfterMs: 60_000,
  });
  expect(mocks.hydrate).toHaveBeenCalledTimes(1);
});
it.each(["missing", "expired"] as const)(
  "keeps stale/incomplete metadata observable and applies the five-second backoff floor when quota is %s",
  async (quota) => {
    const stale = freshGame(1),
      missing = freshGame(2),
      invalid = freshGame(3);
    stale.playerCountsCheckedAt = new Date(Date.now() - 7 * 86_400_000).toISOString();
    delete missing.durationCheckedAt;
    invalid.weightCheckedAt = "unparseable-old-metadata";
    mocks.rows = [stale, missing, invalid, freshGame(4)];
    mocks.quota = quota === "missing" ? null : { nextAt: new Date(Date.now() - 1) };
    const response = await POST(request({ offset: 0 }));
    expect(await response.json()).toMatchObject({
      skipped: 1,
      recovered: 0,
      incomplete: 3,
      nextOffset: null,
      retryAfterMs: 5000,
    });
  },
);
it("keeps a short final batch bounded and returns no further cursor", async () => {
  const response = await POST(request({ offset: 40 }));
  expect(await response.json()).toMatchObject({
    total: 43,
    offset: 40,
    count: 3,
    incomplete: 3,
    nextOffset: null,
  });
  expect(mocks.hydrate.mock.calls[0][1].map((row: BoardGame) => row.id)).toEqual([41, 42, 43]);
});
