import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS, PATCH, POST } from "../route";

const { bulkUpsert, count, removeLegacyThumbnails } = vi.hoisted(() => ({
  bulkUpsert: vi.fn(async () => 1),
  count: vi.fn(async () => 181_532),
  removeLegacyThumbnails: vi.fn(async () => 7),
}));
vi.mock("@/app/lib/db", () => ({ getDb: async () => ({ databaseName: "board-game-organizer" }) }));
vi.mock("@/app/lib/games/boardGames.repository", () => ({
  BoardGamesRepository: class {
    bulkUpsert = bulkUpsert;
    count = count;
    removeLegacyThumbnails = removeLegacyThumbnails;
  },
}));

const game = {
  id: 80,
  name: "VolgaFront",
  yearPublished: 2000,
  rank: 0,
  bayesAverage: 0,
  average: 7.5,
  usersRated: 4,
  isExpansion: true,
  abstractsRank: null,
  cgsRank: null,
  childrensGamesRank: null,
  familyGamesRank: null,
  partyGamesRank: null,
  strategyGamesRank: null,
  thematicRank: null,
  warGamesRank: 12,
};
const request = (games: unknown[], token = "test-secret") =>
  new Request("http://localhost/api/admin/import-games", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ games }),
  });

beforeEach(() => {
  vi.stubEnv("CLERK_SECRET_KEY", "test-secret");
  vi.clearAllMocks();
});

describe("/api/admin/import-games", () => {
  it("handles CORS preflight without credentials", () => {
    expect(OPTIONS(new Request("http://localhost/api/admin/import-games")).status).toBe(204);
  });

  it("rejects missing server credentials", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const url = "http://localhost/api/admin/import-games";
    const headers = { authorization: "Bearer test-secret" };
    expect((await GET(new Request(url, { headers }))).status).toBe(401);
    expect((await PATCH(new Request(url, { method: "PATCH", headers }))).status).toBe(401);
    expect((await POST(request([game]))).status).toBe(401);
  });

  it("attests the schema and target database only to the authorized importer", async () => {
    const url = "http://localhost/api/admin/import-games";
    expect((await GET(new Request(url))).status).toBe(401);
    const res = await GET(new Request(url, { headers: { authorization: "Bearer test-secret" } }));
    expect(await res.json()).toEqual({ schemaVersion: 2, databaseName: "board-game-organizer" });
  });
  it("cleans remaining legacy thumbnails with admin authorization", async () => {
    const url = "http://localhost/api/admin/import-games";
    expect((await PATCH(new Request(url, { method: "PATCH" }))).status).toBe(401);
    const res = await PATCH(
      new Request(url, { method: "PATCH", headers: { authorization: "Bearer test-secret" } }),
    );
    expect(await res.json()).toEqual({ ok: true, removed: 7 });
  });

  it("requires the matching secret", async () => {
    expect((await POST(request([game], "wrong"))).status).toBe(401);
    expect(bulkUpsert).not.toHaveBeenCalled();
  });

  it("rejects missing metadata, invalid flags and oversized batches", async () => {
    expect((await POST(request([{ id: 80, name: "Old importer" }]))).status).toBe(400);
    expect((await POST(request([{ ...game, isExpansion: 1 }]))).status).toBe(400);
    expect((await POST(request(Array(501).fill(game)))).status).toBe(400);
    expect(bulkUpsert).not.toHaveBeenCalled();
  });

  it("persists all columns and reports progress", async () => {
    const res = await POST(request([game]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, written: 1, total: 181_532 });
    expect(bulkUpsert).toHaveBeenCalledWith([game]);
  });
});
