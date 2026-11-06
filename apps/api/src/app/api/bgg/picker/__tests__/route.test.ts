import { beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "@/app/lib/community.error";
import { GET } from "../route";

const owned = {
  userId: "viewer",
  snapshot: "snap",
  gameId: 1,
  name: "Azul",
  year: 2017,
  imageUrl: null,
};
const other = { id: 2, name: "Azul Summer", year: 2024, imageUrl: null };
const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "viewer" as string | null })),
  get: vi.fn(
    async (): Promise<{ active: { snapshot: string } | null; pending: null }> => ({
      active: { snapshot: "snap" },
      pending: null,
    }),
  ),
  exclude: vi.fn(async () => [1] as number[]),
  collectionRows: vi.fn(() => [owned]),
  search: vi.fn(async () => [
    { id: 1, name: "Azul", year: 2017, imageUrl: null },
    { id: 2, name: "Azul Summer", year: 2024, imageUrl: null },
  ]),
}));
function find(rows: object[]) {
  let selected = rows;
  const cursor = {
    sort: () => cursor,
    skip: (offset: number) => {
      selected = selected.slice(offset);
      return cursor;
    },
    limit: (count: number) => {
      selected = selected.slice(0, count);
      return cursor;
    },
    project: () => cursor,
    toArray: async () => selected,
  };
  return cursor;
}
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/games/bgg", () => ({
  searchGames: async (
    _db: unknown,
    _query: string,
    offset: number,
    limit: number,
    excluded: number[] = [],
  ) =>
    (await mocks.search())
      .filter((game) => !excluded.includes(game.id))
      .slice(offset, offset + limit),
}));
vi.mock("@/app/lib/games/bgg-account.repository", () => ({
  BggAccountRepository: vi.fn().mockImplementation(() => ({ get: mocks.get })),
}));
vi.mock("@/app/lib/community/record-services", () => ({
  recordServices: () => ({ events: { proposalPickerExclusions: mocks.exclude } }),
}));
vi.mock("@/app/lib/db", () => ({
  withTransaction: async (work: (session: unknown, db: unknown) => unknown) => work({}, {}),
  COLLECTIONS: { BGG_COLLECTION_GAMES: "bggCollectionGames", BOARD_GAMES: "boardGames" },
  getDb: async () => ({
    collection: (name: string) => ({
      find: (filter: { gameId?: { $in?: number[]; $nin?: number[] }; name?: RegExp }) =>
        find(
          name === "boardGames"
            ? [{ id: 1, name: "Azul", average: 7.5, minPlayMinutes: 30, maxPlayMinutes: 45 }]
            : mocks
                .collectionRows()
                .filter(
                  (game) =>
                    (!filter.gameId ||
                      (filter.gameId.$in
                        ? filter.gameId.$in.includes(game.gameId)
                        : !filter.gameId.$nin?.includes(game.gameId))) &&
                    (!filter.name || filter.name.test(game.name)),
                ),
        ),
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "viewer" });
  mocks.exclude.mockReset().mockResolvedValue([1]);
  mocks.get.mockResolvedValue({ active: { snapshot: "snap" }, pending: null });
  mocks.collectionRows.mockReturnValue([owned]);
});

const request = (params: string) => new Request(`http://localhost/api/bgg/picker?${params}`);

it("applies only current own/canonical proposal exclusions before source paging and binds cursors", async () => {
  const scope =
    "proposalEventId=11111111-1111-4111-8111-111111111111&proposalTableId=22222222-2222-4222-8222-222222222222";
  const result = await GET(request(`query=Azul&limit=1&${scope}`));
  const body = await result.json();
  expect(result.status).toBe(200);
  expect(body.items.map((g: { id: number }) => g.id)).toEqual([2]);
  expect(mocks.exclude).toHaveBeenCalledWith(
    "viewer",
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  );
  mocks.search.mockResolvedValueOnce([other, { ...other, id: 3 }]);
  const paged = await (
    await GET(request(`query=Azul&search=1&collection=0&limit=1&${scope}`))
  ).json();
  mocks.exclude.mockResolvedValue([1, 2]);
  expect(
    (
      await GET(
        request(`query=Azul&search=1&collection=0&limit=1&${scope}&cursor=${paged.nextCursor}`),
      )
    ).status,
  ).toBe(409);
  expect((await GET(request("proposalEventId=11111111-1111-4111-8111-111111111111"))).status).toBe(
    400,
  );
  mocks.exclude.mockRejectedValueOnce(new CommunityError(403, "PROPOSAL_SEAT_REQUIRED"));
  expect((await GET(request(`query=Azul&${scope}`))).status).toBe(403);
  mocks.exclude.mockRejectedValueOnce(new Error("unavailable"));
  expect((await GET(request(`query=Azul&${scope}`))).status).toBe(500);
});
it("requires auth and rejects malformed cursors", async () => {
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect((await GET(request("query=Azul"))).status).toBe(401);
  expect((await GET(request("query=Azul&cursor=invalid"))).status).toBe(409);
  expect((await GET(request("query=Azul&limit=500"))).status).toBe(400);
});

it("includes already-known catalog durations in collection rows and preserves explicit missing-metadata fallback", async () => {
  mocks.collectionRows.mockReturnValue([owned, { ...owned, gameId: 3, name: "Unknown duration" }]);
  const response = await GET(request("search=0&limit=5"));
  expect((await response.json()).items).toMatchObject([
    { id: 1, minPlayMinutes: 30, maxPlayMinutes: 45 },
    { id: 3, minPlayMinutes: null, maxPlayMinutes: null },
  ]);
  expect(mocks.search).not.toHaveBeenCalled();
});

it("returns collection first, then excludes matching BGG IDs from all search pages", async () => {
  const first = await GET(request("query=Azul&limit=1"));
  expect(first.status).toBe(200);
  const collectionPage = await first.json();
  expect(collectionPage.items).toMatchObject([{ id: 1, source: "collection" }]);
  expect(collectionPage.nextCursor).toBeTruthy();
  const searchPage = await (
    await GET(request(`query=Azul&limit=1&cursor=${collectionPage.nextCursor}`))
  ).json();
  expect(searchPage.items).toMatchObject([{ id: 2, source: "search" }]);
  expect(searchPage.nextCursor).toBeNull();
  expect(mocks.search).toHaveBeenCalled();
});

it("combines filtered collection and deduplicated catalog results in the first page", async () => {
  const response = await GET(request("query=Azul&limit=3"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    items: [
      { id: 1, source: "collection" },
      { id: 2, source: "search" },
    ],
    nextCursor: null,
  });
});

it("keeps both sources visible while paging a larger matching collection", async () => {
  mocks.collectionRows.mockReturnValue([
    owned,
    { ...owned, gameId: 3, name: "Azul Duel" },
    { ...owned, gameId: 4, name: "Azul Mini" },
    { ...owned, gameId: 5, name: "Catan" },
  ]);
  const first = await (await GET(request("query=Azul&limit=4"))).json();
  expect(first.items).toMatchObject([
    { id: 1, source: "collection" },
    { id: 3, source: "collection" },
    { id: 2, source: "search" },
  ]);
  expect(first.nextCursor).toBeTruthy();
  const second = await (await GET(request(`query=Azul&limit=4&cursor=${first.nextCursor}`))).json();
  expect(second.items).toMatchObject([{ id: 4, source: "collection" }]);
  expect(second.nextCursor).toBeNull();
  expect([...first.items, ...second.items].map((item: { id: number }) => item.id)).toEqual([
    1, 3, 2, 4,
  ]);
});

it("hides collection without active snapshot while retaining all catalog results", async () => {
  mocks.get.mockResolvedValueOnce({ active: null, pending: null });
  const response = await GET(request("query=Azul&limit=2"));
  expect((await response.json()).items).toMatchObject([
    { id: 1, source: "search" },
    { id: 2, source: "search" },
  ]);
});
