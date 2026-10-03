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
  <item objectid="3" subtype="boardgameexpansion"><name>Expansion</name></item>
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

  it("keeps non-owned games and public status data, excludes expansions, deduplicates IDs", () => {
    const items = parseBggCollection(collectionXml, "clerk", "snapshot");
    expect(items.map((item) => item.gameId)).toEqual([1, 2]);
    expect(items[0]).toMatchObject({ name: "Base Game", year: 2024, userId: "clerk" });
    expect(items[0].xml).toContain('wishlist="1"');
    expect(items[0].xml).toContain("<numplays>3</numplays>");
    expect(parseBggCollection('<items totalitems="0"/>', "clerk", "snapshot")).toEqual([]);
    expect(() => parseBggCollection("<message>Unavailable</message>", "clerk", "snapshot")).toThrow(
      BggRemoteError,
    );
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
        '<items totalitems="2"><item objectid="1" subtype="boardgame"><name>A</name></item></items>',
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
        '<items><item objectid="0" subtype="boardgame"><name>Invalid</name></item><item objectid="4" subtype="boardgame"><name></name></item><item objectid="5" subtype="boardgame"><name>Valid</name><yearpublished>unknown</yearpublished><image>https://evil.example/cover.jpg</image></item></items>',
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
      .mockResolvedValueOnce(new Response(collectionXml));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchBggUser("alice")).resolves.toMatchObject({ id: 42 });
    await expect(fetchBggCollection("alice", "clerk", "snap")).rejects.toMatchObject({
      kind: "rate_limited",
    });
    await expect(fetchBggCollection("alice", "clerk", "snap")).resolves.toHaveLength(2);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
    expect(fetchMock.mock.calls[1][0]).toContain(
      "collection?username=alice&stats=1&excludesubtype=boardgameexpansion",
    );
  });
});
