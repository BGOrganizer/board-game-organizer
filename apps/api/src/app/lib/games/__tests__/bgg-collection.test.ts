import { DOMParser } from "@xmldom/xmldom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BggRemoteError,
  fetchBggCollection,
  fetchBggUser,
  parseBggCollection,
  parseBggUser,
} from "../bgg-collection";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const userXml =
  '<user id="42" name="alice"><avatarlink value="https://cf.geekdo-static.com/avatars/42.png"/></user>';
const collectionXml = `<items totalitems="3">
  <item objectid="1" subtype="boardgame"><name>Base Game</name><yearpublished>2024</yearpublished>
    <image>https://cf.geekdo-images.com/example/image.jpg</image>
    <status own="0" wishlist="1"/><numplays>3</numplays></item>
  <item objectid="2" subtype="boardgame"><name>Owned Game</name><status own="1"/></item>
  <item objectid="3" subtype="boardgameexpansion"><name>Expansion</name><status own="1"/></item>
</items>`;

describe("BGG collection parser", () => {
  it("validates username and optional avatar from BGG profile", () => {
    expect(parseBggUser(userXml)).toEqual({
      id: 42,
      username: "alice",
      avatarUrl: "https://cf.geekdo-static.com/avatars/42.png",
    });
    expect(parseBggUser('<user id="0" name="nobody"/>')).toBeNull();
    expect(
      parseBggUser('<user id="3" name="x"><avatarlink value="http://localhost/evil"/></user>')
        ?.avatarUrl,
    ).toBeNull();
  });

  it("excludes non-owned games and retains owned wishlist status, excludes expansions, deduplicates IDs", () => {
    const items = parseBggCollection(collectionXml, "clerk", "snapshot");
    expect(items.map((item) => item.gameId)).toEqual([2]);
    expect(items[0]).toMatchObject({ name: "Owned Game", userId: "clerk" });
    expect(parseBggCollection('<items totalitems="0"/>', "clerk", "snapshot")).toEqual([]);
    expect(() => parseBggCollection("<message>Unavailable</message>", "clerk", "snapshot")).toThrow(
      BggRemoteError,
    );
  });

  it.each(["N/A", "0", "-1", "11", "NaN", "", "1", "10", "7.25"])(
    "reads personal rating safely without substituting public average: %s",
    (value) => {
      const [row] = parseBggCollection(
        `<items><item objectid="1" subtype="boardgame"><name>Base</name><status own="1" wishlist="1"/><stats><rating value="${value}"><average value="9.9"/></rating></stats></item></items>`,
        "user",
        "snap",
      );
      const n = Number(value);
      expect(row.userRating).toBe(Number.isFinite(n) && n >= 1 && n <= 10 ? n : null);
      expect(row.wishlist).toBe(true);
      expect(row.isExpansion).toBe(false);
    },
  );

  it("counts titles once while preserving wishlist and personal rating across duplicate editions", () => {
    const rows = parseBggCollection(
      '<items totalitems="2"><item objectid="1" subtype="boardgame"><name>Game</name><status own="1" wishlist="1"/><stats><rating value="7.25"/></stats></item><item objectid="1" subtype="boardgame"><name>Game</name><status own="1" wishlist="0"/><stats><rating value="N/A"/></stats></item></items>',
      "user",
      "snapshot",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userRating: 7.25, wishlist: true });
  });

  it("deduplicates overlapping partitions and preserves earlier personal metadata without inventing missing ratings", async () => {
    vi.stubEnv("BGG_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            '<items><item objectid="1" subtype="boardgame"><name>Rated</name><status own="1" wishlist="1"/><stats><rating value="8.5"/></stats></item><item objectid="4" subtype="boardgame"><name>Unrated</name><status own="1"/></item></items>',
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            '<items><item objectid="1" subtype="boardgameexpansion"><name>Rated</name><status own="1" wishlist="0"/></item><item objectid="2" subtype="boardgameexpansion"><name>New unrated</name><status own="1"/></item><item objectid="4" subtype="boardgameexpansion"><name>Unrated</name><status own="1"/></item></items>',
          ),
        ),
    );
    const rows = await fetchBggCollection("alice", "user", "snapshot");
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.gameId === 1)).toMatchObject({
      isExpansion: true,
      wishlist: true,
      userRating: 8.5,
    });
    for (const id of [2, 4])
      expect(rows.find((row) => row.gameId === id)).toMatchObject({
        isExpansion: true,
        wishlist: false,
        userRating: null,
      });
  });

  it("never returns a partial collection when the expansion partition is still queued", async () => {
    vi.stubEnv("BGG_TOKEN", "test-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(collectionXml))
      .mockResolvedValueOnce(new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchBggCollection("alice", "user", "snap")).rejects.toMatchObject({
      kind: "rate_limited",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed responses, invalid IDs, unsafe image hosts and incomplete games", () => {
    expect(parseBggUser("<error/>")).toBeNull();
    expect(parseBggUser('<user id="3" name=""/>')).toBeNull();
    expect(
      parseBggUser('<user id="5" name="bob"><avatarlink value="not-a-url"/></user>')?.avatarUrl,
    ).toBeNull();
    expect(() => parseBggUser("<user><broken></user>")).toThrow(BggRemoteError);
    expect(() =>
      parseBggCollection(
        '<items totalitems="2"><item objectid="1" subtype="boardgame"><name>A</name><status own="1"/></item></items>',
        "user",
        "snap",
      ),
    ).toThrow(BggRemoteError);
    expect(parseBggCollection('<items totalitems="0"/>', "user", "snap")).toEqual([]);
    vi.spyOn(DOMParser.prototype, "parseFromString").mockReturnValueOnce({
      documentElement: null,
    } as unknown as ReturnType<DOMParser["parseFromString"]>);
    expect(() => parseBggUser("anything")).toThrow(BggRemoteError);
    expect(
      parseBggCollection(
        '<items><item objectid="0" subtype="boardgame"><name>Invalid</name><status own="1"/></item><item objectid="4" subtype="boardgame"><name></name><status own="1"/></item><item objectid="5" subtype="boardgame"><name>Valid</name><status own="1"/><yearpublished>unknown</yearpublished><image>https://evil.example/cover.jpg</image></item></items>',
        "user",
        "snap",
      ),
    ).toMatchObject([{ gameId: 5, year: null, imageUrl: null }]);
  });

  it("rejects unavailable BGG and distinguishes rate limits from unknown users", async () => {
    await expect(fetchBggUser("alice")).rejects.toMatchObject({ kind: "unavailable" });
    vi.stubEnv("BGG_TOKEN", "test-token");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "8" } }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("server error", { status: 500 }))
      .mockResolvedValueOnce(new Response(""))
      .mockResolvedValueOnce(new Response("x".repeat(25_000_001)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchBggUser("alice")).rejects.toMatchObject({ kind: "unavailable" });
    await expect(fetchBggCollection("alice", "user", "snap")).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterMs: 8000,
    });
    await expect(fetchBggUser("missing")).rejects.toMatchObject({ kind: "not_found" });
    await expect(fetchBggUser("error")).rejects.toMatchObject({ kind: "unavailable" });
    await expect(fetchBggUser("empty")).rejects.toMatchObject({ kind: "unavailable" });
    await expect(fetchBggUser("huge")).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("uses server BGG token and distinguishes queued exports from missing users", async () => {
    vi.stubEnv("BGG_TOKEN", "test-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(userXml))
      .mockResolvedValueOnce(new Response("", { status: 202 }))
      .mockResolvedValueOnce(new Response(collectionXml))
      .mockResolvedValueOnce(
        new Response(
          '<items totalitems="1"><item objectid="3" subtype="boardgame"><name>Expansion</name><status own="1" wishlist="1"/><stats><rating value="8.5"><average value="6"/></rating></stats></item></items>',
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchBggUser("alice")).resolves.toMatchObject({ id: 42 });
    await expect(fetchBggCollection("alice", "clerk", "snap")).rejects.toMatchObject({
      kind: "rate_limited",
    });
    const full = await fetchBggCollection("alice", "clerk", "snap");
    expect(full).toHaveLength(2);
    expect(full[1]).toMatchObject({
      gameId: 3,
      isExpansion: true,
      subtype: "boardgameexpansion",
      wishlist: true,
      userRating: 8.5,
    });
    expect(fetchMock.mock.calls[3][0]).toContain("subtype=boardgameexpansion");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
    expect(fetchMock.mock.calls[1][0]).toContain(
      "collection?username=alice&own=1&stats=1&excludesubtype=boardgameexpansion",
    );
  });
});

it.each([false, true])(
  "requires explicit ownership in either partition: expansion=%s",
  (expansion) => {
    const body =
      "<items>" +
      ["0", "1", null]
        .map(
          (own, index) =>
            '<item objectid="' +
            (index + 1) +
            '" subtype="boardgame"><name>Game</name><status wishlist="1" ' +
            (own === null ? "" : 'own="' + own + '"') +
            "/></item>",
        )
        .join("") +
      "</items>";
    const rows = parseBggCollection(body, "user", "snapshot", expansion);
    expect(rows.map((row) => row.gameId)).toEqual([2]);
    expect(rows[0]).toMatchObject({ wishlist: true, isExpansion: expansion });
  },
);
