import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hydrateGames } from "../bgg";

const checkedAt = "2026-11-10T11:00:00.000Z";
const now = "2026-11-10T12:00:00.000Z";
function game(id = 1) {
  return {
    id,
    name: `Game ${id}`,
    image: "https://cf.geekdo-images.com/cached.jpg",
    imageCheckedAt: checkedAt,
    minPlayers: 2,
    maxPlayers: 4,
    playerCountsCheckedAt: checkedAt,
    minPlayMinutes: null as number | null,
    maxPlayMinutes: null as number | null,
    durationCheckedAt: checkedAt,
    metadataAttemptedAt: undefined as string | undefined,
  };
}
function fixture(xml: string) {
  const quota = { updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }) };
  const catalog = { bulkWrite: vi.fn().mockResolvedValue({}) };
  const db = { collection: (name: string) => (name === "bggQuota" ? quota : catalog) };
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => xml });
  vi.stubGlobal("fetch", fetch);
  return { db: db as never, quota, catalog, fetch };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  vi.stubEnv("BGG_TOKEN", "test-token");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("repairs missing and partial minutes despite a legacy fresh success timestamp", async () => {
  const h = fixture(
    '<items><item id="1"><playingtime value="45"/></item><item id="2"><minplaytime value="30"/><maxplaytime value="90"/></item></items>',
  );
  const missing = game(),
    partial = { ...game(2), maxPlayMinutes: 90 };
  await hydrateGames(h.db, [missing, partial], true);
  expect(missing).toMatchObject({ minPlayMinutes: 45, maxPlayMinutes: 45, durationCheckedAt: now });
  expect(partial).toMatchObject({ minPlayMinutes: 30, maxPlayMinutes: 90, durationCheckedAt: now });
  expect(h.fetch).toHaveBeenCalledOnce();
  expect(h.fetch.mock.calls[0][0]).toBe("https://boardgamegeek.com/xmlapi2/thing?id=1,2&stats=1");
  await hydrateGames(h.db, [missing, partial], true);
  expect(h.fetch).toHaveBeenCalledOnce();
});

it.each([
  "<items/>",
  '<items><item id="2"><playingtime value="45"/></item></items>',
  '<items><item id="1"/></items>',
  '<items><item id="1"><playingtime value="0"/></item></items>',
  '<items><item id="1"><minplaytime value="90"/><maxplaytime value="30"/></item></items>',
  '<items><item id="1"><minplaytime value="30"/></item></items>',
])(
  "does not mark incomplete or unavailable minutes as refreshed, and retries after five minutes: %s",
  async (xml) => {
    const h = fixture(xml),
      row = game();
    await hydrateGames(h.db, [row], true);
    expect(row.durationCheckedAt).toBe(checkedAt);
    expect(row.metadataAttemptedAt).toBe(now);
    expect(h.catalog.bulkWrite.mock.calls[0][0][0].updateOne.update.$set).not.toHaveProperty(
      "durationCheckedAt",
    );
    await hydrateGames(h.db, [row], true);
    expect(h.fetch).toHaveBeenCalledOnce();
    vi.setSystemTime(Date.parse(now) + 5 * 60_000);
    await hydrateGames(h.db, [row], true);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  },
);

it("records successful durations only for the matching items actually returned", async () => {
  const h = fixture('<items><item id="1"><playingtime value="60"/></item></items>');
  const recovered = game(),
    absent = game(2);
  await hydrateGames(h.db, [recovered, absent], true);
  expect(recovered.durationCheckedAt).toBe(now);
  expect(absent.durationCheckedAt).toBe(checkedAt);
  expect(absent.minPlayMinutes).toBeNull();
  expect(absent.maxPlayMinutes).toBeNull();
});

it("preserves stale verified values and their success date if the provider omits the duration", async () => {
  const h = fixture('<items><item id="1"/></items>');
  const row = {
    ...game(),
    minPlayMinutes: 30,
    maxPlayMinutes: 60,
    durationCheckedAt: "2026-11-01T12:00:00Z",
  };
  await hydrateGames(h.db, [row], true);
  expect(row).toMatchObject({
    minPlayMinutes: 30,
    maxPlayMinutes: 60,
    durationCheckedAt: "2026-11-01T12:00:00Z",
    metadataAttemptedAt: now,
  });
  const saved = h.catalog.bulkWrite.mock.calls[0][0][0].updateOne.update.$set;
  for (const field of [
    "minPlayMinutes",
    "maxPlayMinutes",
    "durationCheckedAt",
    "minPlayers",
    "maxPlayers",
    "playerCountsCheckedAt",
  ])
    expect(saved).not.toHaveProperty(field);
});

it("does not combine a partial provider duration into an invalid previously verified range", async () => {
  const h = fixture('<items><item id="1"><minplaytime value="90"/></item></items>');
  const row = {
    ...game(),
    minPlayMinutes: 30,
    maxPlayMinutes: 60,
    durationCheckedAt: "2026-11-01T12:00:00Z",
  };
  await hydrateGames(h.db, [row], true);
  expect(row).toMatchObject({
    minPlayMinutes: 30,
    maxPlayMinutes: 60,
    durationCheckedAt: "2026-11-01T12:00:00Z",
  });
});

it.each([
  { minPlayMinutes: null, maxPlayMinutes: 60, xml: '<minplaytime value="90"/>' },
  { minPlayMinutes: 90, maxPlayMinutes: null, xml: '<maxplaytime value="60"/>' },
])(
  "retains unknown endpoints rather than saving a contradictory mixed range: $xml",
  async (value) => {
    const h = fixture(`<items><item id="1">${value.xml}</item></items>`);
    const row = {
      ...game(),
      minPlayMinutes: value.minPlayMinutes,
      maxPlayMinutes: value.maxPlayMinutes,
    };
    await hydrateGames(h.db, [row], true);
    expect(row.minPlayMinutes).toBe(value.minPlayMinutes);
    expect(row.maxPlayMinutes).toBe(value.maxPlayMinutes);
    expect(row.durationCheckedAt).toBe(checkedAt);
  },
);

it("does not stamp a game when quota is occupied, so it can recover on its next eligible read", async () => {
  const h = fixture('<items><item id="1"><playingtime value="45"/></item></items>');
  const row = game();
  h.quota.updateOne.mockRejectedValueOnce(Object.assign(new Error("occupied"), { code: 11000 }));
  await hydrateGames(h.db, [row], true);
  expect(h.fetch).not.toHaveBeenCalled();
  expect(h.catalog.bulkWrite).not.toHaveBeenCalled();
  expect(row.metadataAttemptedAt).toBeUndefined();
  expect(row.durationCheckedAt).toBe(checkedAt);
  vi.setSystemTime(Date.parse(now) + 5000);
  await hydrateGames(h.db, [row], true);
  expect(row.minPlayMinutes).toBe(45);
  expect(row.durationCheckedAt).toBe(new Date(Date.now()).toISOString());
});

it("does not stamp metadata when the network fails", async () => {
  const h = fixture("<items/>"),
    row = game();
  h.fetch.mockRejectedValueOnce(new Error("unavailable"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await hydrateGames(h.db, [row], true);
  expect(row.durationCheckedAt).toBe(checkedAt);
  expect(row.metadataAttemptedAt).toBeUndefined();
  expect(h.catalog.bulkWrite).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

it("treats malformed cache dates as eligible rather than hiding missing minutes indefinitely", async () => {
  const h = fixture('<items><item id="1"><playingtime value="45"/></item></items>');
  const row = { ...game(), metadataAttemptedAt: "invalid", durationCheckedAt: "invalid" };
  await hydrateGames(h.db, [row], true);
  expect(row).toMatchObject({ minPlayMinutes: 45, maxPlayMinutes: 45, durationCheckedAt: now });
});

it.each(["0", "NaN", "", "5.1", "-1"])(
  "does not mark absent or invalid weight as fetched: %s",
  async (value) => {
    const h = fixture(
      '<items><item id="1"><statistics><ratings><averageweight value="' +
        value +
        '"/></ratings></statistics></item></items>',
    );
    const row = game();
    await hydrateGames(h.db, [row], true);
    expect(row).not.toHaveProperty("weightCheckedAt");
    expect(row).not.toHaveProperty("averageWeight");
  },
);
it("recovers missing decimal weight in the existing quota batch and persists it", async () => {
  const h = fixture(
    '<items><item id="1"><statistics><ratings><averageweight value="3.275"/></ratings></statistics></item></items>',
  );
  const row = { ...game(), minPlayMinutes: 45, maxPlayMinutes: 45 };
  await hydrateGames(h.db, [row], true);
  expect(row).toMatchObject({ averageWeight: 3.275, weightCheckedAt: now });
  expect(h.catalog.bulkWrite).toHaveBeenCalledWith([
    expect.objectContaining({
      updateOne: expect.objectContaining({
        update: expect.objectContaining({
          $set: expect.objectContaining({ averageWeight: 3.275, weightCheckedAt: now }),
        }),
      }),
    }),
  ]);
  await hydrateGames(h.db, [row], true);
  expect(h.fetch).toHaveBeenCalledOnce();
});

it("preserves verified weight and its success timestamp when a refresh omits weight", async () => {
  const h = fixture('<items><item id="1"/></items>');
  const row = { ...game(), averageWeight: 4.125, weightCheckedAt: "2026-10-01T00:00:00Z" };
  await hydrateGames(h.db, [row], true);
  expect(row).toMatchObject({ averageWeight: 4.125, weightCheckedAt: "2026-10-01T00:00:00Z" });
  expect(h.catalog.bulkWrite.mock.calls[0][0][0].updateOne.update.$set).not.toHaveProperty(
    "weightCheckedAt",
  );
});

it("persists a complete player-count poll and preserves it when later responses omit it", async () => {
  const h = fixture(
    '<items><item id="1"><poll name="suggested_numplayers" totalvotes="5"><results numplayers="7+"><result value="Best" numvotes="3"/><result value="Recommended" numvotes="1"/><result value="Not Recommended" numvotes="1"/></results></poll></item></items>',
  );
  const row = game();
  await hydrateGames(h.db, [row], true);
  expect(row).toHaveProperty("suggestedPlayers.fetchedAt", now);
  expect(row).toHaveProperty("suggestedPlayers.rows.0.sampleCount", 5);
  const saved = structuredClone(row);
  vi.setSystemTime(new Date("2026-11-19T00:00:00Z"));
  h.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => '<items><item id="1"/></items>',
  });
  await hydrateGames(h.db, [row], true);
  expect(row).toHaveProperty(
    "suggestedPlayers",
    (saved as typeof saved & { suggestedPlayers: unknown }).suggestedPlayers,
  );
  expect(h.catalog.bulkWrite.mock.calls[1][0][0].updateOne.update.$set).not.toHaveProperty(
    "suggestedPlayers",
  );
});
it("keeps provider batches bounded to twenty IDs while leaving later games eligible for lazy recovery", async () => {
  const h = fixture("<items/>");
  const rows = Array.from({ length: 25 }, (_, index) => game(index + 1));
  await hydrateGames(h.db, rows, true);
  expect(h.fetch.mock.calls[0][0]).toBe(
    "https://boardgamegeek.com/xmlapi2/thing?id=" +
      Array.from({ length: 20 }, (_, index) => index + 1).join(",") +
      "&stats=1",
  );
  expect(rows[20].metadataAttemptedAt).toBeUndefined();
  expect(h.catalog.bulkWrite.mock.calls[0][0]).toHaveLength(20);
});
