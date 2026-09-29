import { beforeEach, expect, it, vi } from "vitest";
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
vi.mock("@/app/lib/bgg", () => ({
  searchGames: async (_db: unknown, _query: string, offset: number, limit: number) =>
    (await mocks.search()).slice(offset, offset + limit),
}));
vi.mock("@/app/lib/bgg-account.repository", () => ({
  BggAccountRepository: vi.fn().mockImplementation(() => ({ get: mocks.get })),
}));
vi.mock("@/app/lib/db", () => ({
  COLLECTIONS: { BGG_COLLECTION_GAMES: "bggCollectionGames", BOARD_GAMES: "boardGames" },
  getDb: async () => ({
    collection: (name: string) => ({
      find: (filter: { gameId?: { $in: number[] }; name?: RegExp }) =>
        find(
          name === "boardGames"
            ? [{ id: 1, name: "Azul", average: 7.5 }]
            : [owned].filter(
                (game) =>
                  (!filter.gameId || filter.gameId.$in.includes(game.gameId)) &&
                  (!filter.name || filter.name.test(game.name)),
              ),
        ),
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "viewer" });
  mocks.get.mockResolvedValue({ active: { snapshot: "snap" }, pending: null });
});

const request = (params: string) => new Request(`http://localhost/api/bgg/picker?${params}`);

it("requires auth and rejects malformed cursors", async () => {
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect((await GET(request("query=Azul"))).status).toBe(401);
  expect((await GET(request("query=Azul&cursor=invalid"))).status).toBe(409);
  expect((await GET(request("query=Azul&limit=500"))).status).toBe(400);
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

it("hides collection without active snapshot while retaining all catalog results", async () => {
  mocks.get.mockResolvedValueOnce({ active: null, pending: null });
  const response = await GET(request("query=Azul&limit=2"));
  expect((await response.json()).items).toMatchObject([
    { id: 1, source: "search" },
    { id: 2, source: "search" },
  ]);
});
