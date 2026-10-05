import { locationFavoriteKey } from "@board-game-organizer/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeocodingError } from "@/app/lib/geocoding";
import { MatchError } from "@/app/lib/match.service";
import { DELETE, GET, OPTIONS, POST } from "../route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  db: vi.fn(),
  list: vi.fn(),
  statuses: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  detail: vi.fn(),
  geocode: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", async (original) => ({
  ...(await original<typeof import("@/app/lib/db")>()),
  getDb: mocks.db,
  withTransaction: async (operation: (session: never, db: unknown) => Promise<unknown>) =>
    operation({} as never, await mocks.db()),
}));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: vi.fn() }));
vi.mock("@/app/lib/match.service", async (original) => ({
  ...(await original<typeof import("@/app/lib/match.service")>()),
  MatchService: class {
    detail = mocks.detail;
    async requireCurrentUser() {}
  },
}));
vi.mock("@/app/lib/geocoding", async (original) => ({
  ...(await original<typeof import("@/app/lib/geocoding")>()),
  geocodeAddresses: mocks.geocode,
}));
vi.mock("@/app/lib/favorite-locations.repository", () => ({
  FavoriteLocationsRepository: class {
    list = mocks.list;
    statuses = mocks.statuses;
    save = mocks.save;
    remove = mocks.remove;
  },
}));

const location = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Game club",
  address: "Main Street 10",
  longitude: 12.5,
  latitude: 41.9,
};
const key = locationFavoriteKey(location);
function request(method = "GET", body?: unknown, query = "") {
  return new Request(`http://localhost/api/locations/favorites${query}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "user_one" });
  mocks.db.mockResolvedValue({ collection: () => ({}) });
  mocks.list.mockResolvedValue({ items: [{ key, location }], nextCursor: null });
  mocks.statuses.mockResolvedValue([key]);
  mocks.save.mockResolvedValue({ key, location });
  mocks.detail.mockResolvedValue({ match: { locations: [location] } });
  mocks.geocode.mockResolvedValue([location]);
});

describe("private location favorites", () => {
  it("requires authentication on every operation and exposes preflight", async () => {
    expect(OPTIONS(request("OPTIONS")).status).toBe(204);
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request())).status).toBe(401);
    expect((await POST(request("POST", { location }))).status).toBe(401);
    expect((await DELETE(request("DELETE", { key }))).status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("paginates current user's favorites or looks up a bounded batch of keys", async () => {
    expect(await (await GET(request())).json()).toEqual({
      items: [{ key, location }],
      nextCursor: null,
    });
    expect(mocks.list).toHaveBeenCalledWith("user_one", 20, undefined);
    await GET(request("GET", undefined, `?limit=1&cursor=${"a".repeat(64)}`));
    expect(mocks.list).toHaveBeenLastCalledWith("user_one", 1, "a".repeat(64));
    expect(
      await (
        await GET(request("GET", undefined, `?keys=${encodeURIComponent(JSON.stringify([key]))}`))
      ).json(),
    ).toEqual({ keys: [key] });
    expect(mocks.statuses).toHaveBeenCalledWith("user_one", [key]);
    mocks.db.mockRejectedValue(new Error("database unavailable"));
    expect((await GET(request())).status).toBe(500);
  });
  it("rejects unknown, duplicated, malformed and oversized query values", async () => {
    for (const query of [
      "?userId=other",
      "?limit=0",
      "?limit=51",
      "?limit=1&limit=2",
      "?cursor=bad",
      "?keys=bad",
      "?keys=1",
      `?keys=${encodeURIComponent(JSON.stringify(Array(51).fill(key)))}`,
      "?keys=[]&limit=1",
      `?keys=[]&cursor=${"a".repeat(64)}`,
    ])
      expect((await GET(request("GET", undefined, query))).status, query).toBe(400);
  });
  it("saves geocoded addresses and authorized match locations, without geocoding matches again", async () => {
    const fromMatch = await POST(request("POST", { location, matchId: location.id }));
    expect(fromMatch.status).toBe(201);
    expect(await fromMatch.json()).toEqual({ item: { key, location } });
    expect(mocks.detail).toHaveBeenCalledWith("user_one", location.id);
    expect(mocks.geocode).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith("user_one", location);
    expect((await POST(request("POST", { location }))).status).toBe(201);
    expect(mocks.geocode).toHaveBeenCalledWith(location.address);
    mocks.detail
      .mockResolvedValueOnce({ match: {} })
      .mockResolvedValueOnce({ match: { locations: [{ ...location, longitude: 1 }] } });
    expect((await POST(request("POST", { location, matchId: location.id }))).status).toBe(201);
    expect((await POST(request("POST", { location, matchId: location.id }))).status).toBe(201);
  });
  it("preserves authorization, verification and upstream errors", async () => {
    mocks.detail.mockRejectedValueOnce(new MatchError(403, "Forbidden"));
    expect((await POST(request("POST", { location, matchId: location.id }))).status).toBe(403);
    mocks.geocode.mockResolvedValueOnce([{ ...location, longitude: 1 }]);
    expect((await POST(request("POST", { location }))).status).toBe(400);
    mocks.geocode.mockRejectedValueOnce(new GeocodingError("Geocoding unavailable", 503));
    expect((await POST(request("POST", { location }))).status).toBe(503);
    mocks.geocode.mockRejectedValueOnce(new Error("network failure"));
    expect((await POST(request("POST", { location }))).status).toBe(500);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("validates JSON bodies and deletes only current user's key idempotently", async () => {
    for (const method of ["POST", "DELETE"] as const) {
      const handler = method === "POST" ? POST : DELETE;
      expect((await handler(request(method, {}, "?unknown=value"))).status).toBe(400);
      expect((await handler(request(method))).status).toBe(415);
      expect(
        (
          await handler(
            new Request("http://localhost/api/locations/favorites", {
              method,
              headers: { "Content-Type": "application/json" },
              body: "{",
            }),
          )
        ).status,
      ).toBe(400);
      expect((await handler(request(method, {}))).status).toBe(400);
    }
    expect(await (await DELETE(request("DELETE", { key }))).json()).toEqual({ success: true });
    expect(mocks.remove).toHaveBeenCalledWith("user_one", key);
    mocks.remove.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await DELETE(request("DELETE", { key }))).status).toBe(500);
  });
});
