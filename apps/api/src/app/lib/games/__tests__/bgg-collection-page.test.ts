import type {
  BggCollectionGame,
  BggCollectionQuery,
  BoardGame,
} from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BggAccountRepository } from "../bgg-account.repository";

const input: BggCollectionQuery = { snapshot: "snapshot", query: "", limit: 2 };
const counts = { withoutExpansions: 2, withExpansions: 3, wishlist: 1 };
beforeEach(() => vi.stubEnv("BGG_TOKEN", ""));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function fixture(
  rows: Partial<BggCollectionGame>[] = [],
  nextSnapshot = "snapshot",
  legacy = false,
  catalog: Array<Pick<BoardGame, "id" | "name"> & Partial<BoardGame>> = [
    { id: 1, name: "Game 1", average: 6, rank: 7 },
  ],
) {
  const active = {
    id: 1,
    username: "owned",
    avatarUrl: null,
    snapshot: "snapshot",
    syncedAt: new Date(),
    ...(legacy ? {} : { counts }),
  };
  const accounts = {
    findOne: vi
      .fn()
      .mockResolvedValueOnce({ active })
      .mockResolvedValue({ active: { ...active, snapshot: nextSnapshot } }),
  };
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(rows),
  };
  const find = vi.fn().mockReturnValue(cursor);
  const aggregate = vi.fn().mockReturnValue(cursor);
  const catalogFind = vi.fn(() => ({ toArray: async () => catalog }));
  const bulkWrite = vi.fn(async () => ({}));
  const quota = { updateOne: vi.fn(async () => ({ upsertedCount: 1 })) };
  const db = {
    collection: (name: string) =>
      name === "bggAccounts"
        ? accounts
        : name === "bggCollectionGames"
          ? { find, aggregate }
          : name === "bggQuota"
            ? quota
            : { find: catalogFind, bulkWrite },
  } as unknown as Db;
  return {
    repository: new BggAccountRepository(db),
    accounts,
    find,
    aggregate,
    cursor,
    catalogFind,
    bulkWrite,
    quota,
  };
}
const row = (id: number): Partial<BggCollectionGame> => ({
  gameId: id,
  name: `Game ${id}`,
  userId: "owner",
  snapshot: "snapshot",
  year: 2020,
  imageUrl: null,
  subtype: "boardgame",
  isExpansion: false,
  userRating: 8.5,
  wishlist: false,
  xml: "<private/>",
});

describe("authorized collection pages", () => {
  it("keeps legacy expansion identity when a visible collection game is absent from the catalog", async () => {
    const h = fixture(
      [{ ...row(2), isExpansion: undefined, subtype: "boardgameexpansion" }],
      "snapshot",
      false,
      [],
    );
    expect((await h.repository.page("owner", input)).items[0]).toMatchObject({
      id: 2,
      isExpansion: true,
      minPlayMinutes: null,
      maxPlayMinutes: null,
    });
  });
  it("hydrates only the visible page in one quota-controlled batch and returns the recovered duration", async () => {
    vi.stubEnv("BGG_TOKEN", "test-token");
    const h = fixture([row(1), row(2), row(3)]);
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        '<items><item id="1"><playingtime value="45"/></item><item id="2"><minplaytime value="60"/><maxplaytime value="90"/></item></items>',
    });
    vi.stubGlobal("fetch", fetch);
    const page = await h.repository.page("owner", input);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "https://boardgamegeek.com/xmlapi2/thing?id=1,2&stats=1",
      expect.objectContaining({ headers: { Authorization: "Bearer test-token" } }),
    );
    expect(page.items).toMatchObject([
      { id: 1, minPlayMinutes: 45, maxPlayMinutes: 45 },
      { id: 2, minPlayMinutes: 60, maxPlayMinutes: 90 },
    ]);
    expect(h.catalogFind).toHaveBeenCalledWith({ id: { $in: [1, 2] } });
    expect(h.bulkWrite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          updateOne: expect.objectContaining({
            filter: { id: 2 },
            upsert: true,
            update: expect.objectContaining({
              $setOnInsert: { id: 2, name: "Game 2", yearPublished: 2020, isExpansion: false },
              $set: expect.objectContaining({
                minPlayMinutes: 60,
                maxPlayMinutes: 90,
                durationCheckedAt: expect.any(String),
              }),
            }),
          }),
        }),
      ]),
    );
    expect(page.nextCursor).not.toBeNull();
    expect(h.accounts.findOne).toHaveBeenCalledTimes(2);
  });

  it("keeps cached collection metadata and consent guards when another request owns the provider quota", async () => {
    vi.stubEnv("BGG_TOKEN", "test-token");
    const h = fixture([row(1)], "other", false, [
      { id: 1, name: "Game 1", minPlayMinutes: 30, maxPlayMinutes: 60 },
    ]);
    h.quota.updateOne.mockRejectedValue(
      Object.assign(new Error("quota occupied"), { code: 11000 }),
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(h.repository.page("owner", input)).rejects.toMatchObject({ status: 409 });
    expect(fetch).not.toHaveBeenCalled();
    expect(h.bulkWrite).not.toHaveBeenCalled();
    expect(h.accounts.findOne).toHaveBeenCalledTimes(2);
  });
  it.each(["games", "expansions", "none"] as const)(
    "applies %s at source; wishlist independently includes both types before pagination",
    async (types) => {
      const h = fixture();
      await h.repository.page("owner", { ...input, types });
      const match = h.find.mock.calls[0][0].$and;
      expect(match[0]).toEqual({ userId: "owner", snapshot: "snapshot" });
      expect(match[1]).toEqual(
        types === "games"
          ? { isExpansion: { $ne: true }, subtype: { $ne: "boardgameexpansion" } }
          : types === "expansions"
            ? { $or: [{ isExpansion: true }, { subtype: "boardgameexpansion" }] }
            : { gameId: -1 },
      );
      const wished = fixture();
      await wished.repository.page("owner", { ...input, types, wishlist: "true" });
      const wishMatch = wished.find.mock.calls[0][0].$and;
      expect(wishMatch).toHaveLength(2);
      expect(wishMatch[1].$or[0]).toEqual({ wishlist: true });
      expect(wishMatch[1].$or[1].xml.$regex).toContain("wishlist");
      expect(h.cursor.limit).toHaveBeenCalledWith(3);
    },
  );
  it("uses only both current snapshots in a server intersection before sort/limit and rejects changed epochs", async () => {
    const h = fixture([row(1)]);
    h.accounts.findOne.mockImplementation(async ({ userId }: { userId: string }) => ({
      active: {
        snapshot: userId === "viewer" ? "viewer-snapshot" : "snapshot",
        syncedAt: new Date(),
        counts,
      },
    }));
    const result = await h.repository.page(
      "subject",
      { ...input, commonSnapshot: "viewer-snapshot" },
      "viewer",
    );
    expect(result.items).toHaveLength(1);
    expect(h.find).not.toHaveBeenCalled();
    const p = h.aggregate.mock.calls[0][0];
    expect(p[0]).toEqual({ $match: { $and: [{ userId: "subject", snapshot: "snapshot" }] } });
    expect(p[1].$lookup.pipeline[0].$match).toEqual({
      userId: "viewer",
      snapshot: "viewer-snapshot",
      $expr: { $eq: ["$gameId", "$$gameId"] },
    });
    expect(p.at(-1)).toEqual({ $limit: 3 });
    expect(h.accounts.findOne).toHaveBeenCalledTimes(4);
    await expect(
      h.repository.page("subject", { ...input, commonSnapshot: "old" }, "viewer"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a cursor reused with another filter or comparison epoch", async () => {
    const h = fixture([row(1), row(2), row(3)]);
    const result = await h.repository.page("owner", input);
    await expect(
      h.repository.page("owner", { ...input, types: "games", cursor: result.nextCursor ?? "" }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("filters and keyset-pages before response, exposes personal rather than average rating and no XML", async () => {
    const h = fixture([row(1), row(2), row(3)]);
    const result = await h.repository.page("owner", { ...input, query: "[game]" });
    expect(h.find).toHaveBeenCalledWith({
      $and: [
        { userId: "owner", snapshot: "snapshot" },
        { name: { $regex: "\\[game\\]", $options: "i" } },
      ],
    });
    expect(h.cursor.sort).toHaveBeenCalledWith({ name: 1, gameId: 1 });
    expect(h.cursor.limit).toHaveBeenCalledWith(3);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      userRating: 8.5,
      average: 6,
      rank: 7,
      source: "collection",
    });
    expect(result.counts).toEqual(counts);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.items[0]).not.toHaveProperty("userId");
    const next = fixture([row(3)]);
    const last = await next.repository.page("owner", {
      ...input,
      query: "[game]",
      cursor: result.nextCursor ?? "",
    });
    expect(next.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $and: expect.arrayContaining([
          { $or: [{ name: { $gt: "Game 2" } }, { name: "Game 2", gameId: { $gt: 2 } }] },
        ]),
      }),
    );
    expect(last.nextCursor).toBeNull();
  });
  it("keeps expansions in collection, not as playable catalog rows, and reports genuine empty counts", async () => {
    const h = fixture([
      {
        ...row(1),
        isExpansion: true,
        subtype: "boardgameexpansion",
        userRating: null,
        wishlist: true,
      },
    ]);
    expect((await h.repository.page("owner", input)).items[0]).toMatchObject({
      isExpansion: true,
      wishlist: true,
      userRating: null,
    });
    const empty = fixture();
    empty.accounts.findOne.mockReset().mockResolvedValue({
      active: {
        id: 1,
        snapshot: "snapshot",
        syncedAt: new Date(),
        counts: { withoutExpansions: 0, withExpansions: 0, wishlist: 0 },
      },
    });
    expect(await empty.repository.page("owner", input)).toEqual({
      snapshot: "snapshot",
      counts: { withoutExpansions: 0, withExpansions: 0, wishlist: 0 },
      items: [],
      nextCursor: null,
    });
  });
  it("reads legacy personal ratings per returned page but never invents full expansion/wishlist totals", async () => {
    const h = fixture(
      [
        {
          ...row(1),
          isExpansion: undefined,
          wishlist: undefined,
          userRating: undefined,
          xml: '<item objectid="1" subtype="boardgame"><name>Legacy</name><status own="1" wishlist="1"/><stats><rating value="7.25"><average value="4"/></rating></stats></item>',
        },
      ],
      "snapshot",
      true,
    );
    const result = await h.repository.page("owner", input);
    expect(result.counts).toBeNull();
    expect(result.items[0]).toMatchObject({ userRating: 7.25, wishlist: true, isExpansion: false });
    const invalid = fixture([
      { ...row(1), userRating: undefined, wishlist: undefined, xml: "invalid" },
    ]);
    expect((await invalid.repository.page("owner", input)).items[0].userRating).toBeNull();
  });
  it.each(["no-account", "wrong-snapshot", "changed-during-read"])(
    "fails closed on %s",
    async (kind) => {
      const h = fixture([row(1)], kind === "changed-during-read" ? "other" : "snapshot");
      if (kind === "no-account") h.accounts.findOne.mockReset().mockResolvedValue(null);
      await expect(
        h.repository.page("owner", {
          ...input,
          snapshot: kind === "wrong-snapshot" ? "other" : "snapshot",
        }),
      ).rejects.toMatchObject({ status: kind === "no-account" ? 404 : 409 });
    },
  );
  it.each([
    "bad",
    Buffer.from(
      JSON.stringify({ snapshot: "snapshot", name: "x", gameId: 0, scope: "scope" }),
    ).toString("base64url"),
    Buffer.from(JSON.stringify({ snapshot: "snapshot", name: "x", gameId: 1 })).toString(
      "base64url",
    ),
  ])("rejects malformed cursors %s", async (cursor) => {
    await expect(fixture().repository.page("owner", { ...input, cursor })).rejects.toMatchObject({
      status: 400,
    });
  });
  it("rejects a cursor belonging to another snapshot", async () => {
    const cursor = Buffer.from(
      JSON.stringify({ snapshot: "old", name: "x", gameId: 1, scope: "scope" }),
    ).toString("base64url");
    await expect(fixture().repository.page("owner", { ...input, cursor })).rejects.toMatchObject({
      status: 409,
    });
  });
});
