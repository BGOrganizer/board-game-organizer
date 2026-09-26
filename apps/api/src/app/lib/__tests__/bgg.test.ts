import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameDetails, hydrateGames, searchGames } from "@/app/lib/bgg";

const quota = { updateOne: vi.fn() };
const games = { find: vi.fn(), findOne: vi.fn(), bulkWrite: vi.fn() };
const db = {
  collection: (name: string) => (name === "bggQuota" ? quota : games),
} as never;
const sample = {
  id: 1,
  name: "Azul",
  yearPublished: 2017,
  thumbnail: "https://cf.geekdo-static.com/covers/1.jpg",
};

beforeEach(() => {
  vi.stubEnv("BGG_TOKEN", "test-token");
  vi.clearAllMocks();
  quota.updateOne.mockResolvedValue({ upsertedCount: 1, matchedCount: 0 });
  games.bulkWrite.mockResolvedValue({});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("BGG covers", () => {
  it("replaces invented URLs with real batched thumbnail and image, then reuses cache", async () => {
    const rows = [{ ...sample }, { id: 2, name: "Catan", yearPublished: 1995 }];
    games.find.mockReturnValue({ limit: () => ({ toArray: async () => rows }) });
    games.findOne.mockImplementation(async () => rows[0]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<items>
        <item id="1"><thumbnail>https://cf.geekdo-images.com/a/thumb.jpg</thumbnail><image>https://cf.geekdo-images.com/a/full.jpg</image></item>
        <item id="2"><thumbnail>https://cf.geekdo-images.com/b/thumb.jpg</thumbnail><image>https://cf.geekdo-images.com/b/full.jpg</image></item>
      </items>`,
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await searchGames(db, "azul")).toEqual([
      { id: 1, name: "Azul", year: 2017, imageUrl: "https://cf.geekdo-images.com/a/thumb.jpg" },
      { id: 2, name: "Catan", year: 1995, imageUrl: "https://cf.geekdo-images.com/b/thumb.jpg" },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://boardgamegeek.com/xmlapi2/thing?id=1,2",
      expect.objectContaining({ headers: { Authorization: "Bearer test-token" } }),
    );
    expect(games.bulkWrite).toHaveBeenCalledOnce();
    expect(await gameDetails(db, 1)).toMatchObject({
      imageUrl: "https://cf.geekdo-images.com/a/full.jpg",
      year: 2017,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the catalog usable without BGG credentials and rejects unknown games", async () => {
    vi.stubEnv("BGG_TOKEN", "");
    games.findOne.mockResolvedValueOnce({ ...sample }).mockResolvedValueOnce(null);
    expect(await gameDetails(db, 1)).toEqual({ id: 1, name: "Azul", imageUrl: null, year: 2017 });
    await expect(gameDetails(db, 3)).rejects.toThrow("Game 3 not found");
    expect(quota.updateOne).not.toHaveBeenCalled();
  });

  it("returns local data without fabricated covers when quota or BGG is unavailable", async () => {
    const row = { ...sample };
    games.findOne.mockResolvedValue(row);
    quota.updateOne.mockRejectedValue(Object.assign(new Error("duplicate lease"), { code: 11000 }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await gameDetails(db, 1)).toMatchObject({ imageUrl: null, year: 2017 });
    expect(fetchMock).not.toHaveBeenCalled();
    quota.updateOne.mockResolvedValue({ upsertedCount: 1 });
    fetchMock.mockResolvedValue({ status: 429, ok: false });
    await hydrateGames(db, [row]);
    expect(quota.updateOne).toHaveBeenCalledWith(
      { _id: "covers" },
      expect.objectContaining({ $set: expect.any(Object) }),
    );
    expect(row.thumbnail).toBe(sample.thumbnail);
  });

  it("negative-caches missing BGG images without inventing a cover", async () => {
    const row = { ...sample };
    games.findOne.mockResolvedValue(row);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: async () => "<items></items>",
      }),
    );
    expect(await gameDetails(db, 1)).toMatchObject({ imageUrl: null });
    expect(games.bulkWrite).toHaveBeenCalledOnce();
    expect("imageCheckedAt" in row && row.imageCheckedAt).toBeTruthy();
  });

  it("does not publish untrusted image hosts and caches the missing cover", async () => {
    const row = { ...sample };
    games.findOne.mockResolvedValue(row);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: async () =>
          '<items><item id="1"><thumbnail>https://bad.example/track.jpg</thumbnail><image>javascript:alert(1)</image></item></items>',
      }),
    );
    expect(await gameDetails(db, 1)).toMatchObject({ imageUrl: null });
    expect(games.bulkWrite).toHaveBeenCalledOnce();
    expect("imageCheckedAt" in row && row.imageCheckedAt).toBeTruthy();
    expect(row.thumbnail).toBeNull();
  });

  it.each([202, 429, 401])(
    "keeps cached catalog results when BGG returns HTTP %i",
    async (status) => {
      const row = { ...sample };
      games.findOne.mockResolvedValue(row);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status, ok: false }));
      expect(await gameDetails(db, 1)).toMatchObject({ imageUrl: null, year: 2017 });
      expect(games.bulkWrite).not.toHaveBeenCalled();
      if (status === 401)
        expect(console.warn).toHaveBeenCalledWith("BGG cover lookup returned HTTP", 401);
      else expect(quota.updateOne).toHaveBeenCalledTimes(2);
    },
  );

  it("does not block search for an unavailable quota collection or network", async () => {
    const row = { ...sample };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    quota.updateOne.mockRejectedValueOnce(new Error("Mongo unavailable"));
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("BGG unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await hydrateGames(db, [row]);
    expect(warning).toHaveBeenCalledWith("BGG cover quota unavailable", "Error");
    expect(fetchMock).not.toHaveBeenCalled();
    quota.updateOne.mockResolvedValue({ matchedCount: 0, upsertedCount: 0 });
    await hydrateGames(db, [row]);
    expect(fetchMock).not.toHaveBeenCalled();
    quota.updateOne.mockResolvedValue({ matchedCount: 1 });
    await hydrateGames(db, [row]);
    expect(warning).toHaveBeenCalledWith("BGG cover lookup failed", "Error");
  });

  it("ignores HTML errors instead of negative-caching them", async () => {
    const row = { ...sample };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: async () => "<html><body>blocked</body></html>",
      }),
    );
    await hydrateGames(db, [row]);
    expect(games.bulkWrite).not.toHaveBeenCalled();
    expect(row.thumbnail).toBe(sample.thumbnail);
  });

  it("accepts only requested IDs and HTTPS BGG covers, falling back to full images", async () => {
    const row = { ...sample, imageCheckedAt: "2020-01-01T00:00:00Z" };
    games.findOne.mockResolvedValue(row);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: async () =>
          '<items><item id="99"><thumbnail>https://cf.geekdo-images.com/other.jpg</thumbnail></item><item id="1"><thumbnail>not-a-url</thumbnail><image>https://cf.geekdo-images.com/azul.jpg</image></item></items>',
      }),
    );
    expect(await gameDetails(db, 1)).toMatchObject({
      imageUrl: "https://cf.geekdo-images.com/azul.jpg",
    });
    expect(row.thumbnail).toBe("https://cf.geekdo-images.com/azul.jpg");
    expect(games.bulkWrite.mock.calls[0][0]).toHaveLength(1);
  });

  it("handles missing XML image tags and caches a null cover", async () => {
    const row = { ...sample };
    games.findOne.mockResolvedValue(row);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        text: async () => '<items><item id="1"></item></items>',
      }),
    );
    expect(await gameDetails(db, 1)).toMatchObject({ imageUrl: null });
    expect(row.thumbnail).toBeNull();
  });

  it("reports unknown quota and network errors without failing the catalog", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const row = { ...sample };
    quota.updateOne.mockRejectedValueOnce({ code: 12 });
    await hydrateGames(db, [row]);
    expect(warning).toHaveBeenCalledWith("BGG cover quota unavailable", "unknown error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("failed"));
    await hydrateGames(db, [row]);
    expect(warning).toHaveBeenCalledWith("BGG cover lookup failed", "unknown error");
  });

  it("uses cached thumbnail in details and cached full image in searches", async () => {
    const imageUrl = "https://cf.geekdo-images.com/a/thumb.jpg";
    games.findOne.mockResolvedValue({ id: 1, name: "Azul", thumbnail: imageUrl });
    expect(await gameDetails(db, 1)).toEqual({ id: 1, name: "Azul", imageUrl, year: null });

    const row = { id: 1, name: "Azul", image: "https://cf.geekdo-images.com/a/full.jpg" };
    games.find.mockReturnValue({ limit: () => ({ toArray: async () => [row] }) });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await searchGames(db, "Azul")).toEqual([
      { id: 1, name: "Azul", year: null, imageUrl: row.image },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
