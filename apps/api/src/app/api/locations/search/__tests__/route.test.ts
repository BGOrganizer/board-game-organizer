import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../route";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
const originalToken = process.env.MAPBOX_GEOCODING_TOKEN;
const request = (query: string) =>
  new Request(`http://localhost/api/locations/search?query=${encodeURIComponent(query)}`);
afterEach(() => {
  if (originalToken === undefined) delete process.env.MAPBOX_GEOCODING_TOKEN;
  else process.env.MAPBOX_GEOCODING_TOKEN = originalToken;
  vi.unstubAllGlobals();
  mocks.auth.mockReset();
});

it("requires authentication, a valid query and configured permanent geocoding", async () => {
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect((await GET(request("Rome"))).status).toBe(401);
  mocks.auth.mockResolvedValue({ userId: "user_admin" });
  expect((await GET(request("Rom"))).status).toBe(400);
  delete process.env.MAPBOX_GEOCODING_TOKEN;
  expect((await GET(request("Rome"))).status).toBe(503);
});

it("requests at most five permanent results and returns only stored location fields", async () => {
  mocks.auth.mockResolvedValue({ userId: "user_admin" });
  process.env.MAPBOX_GEOCODING_TOKEN = "test-token";
  const fetchMock = vi.fn().mockImplementation(async (url: URL) => {
    expect(url.searchParams.get("permanent")).toBe("true");
    expect(url.searchParams.get("types")).toBe("address");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("q")).toBe("Game cafe");
    return Response.json({
      features: [
        {
          properties: { mapbox_id: "place.1", full_address: "123 Main St" },
          geometry: { coordinates: [12.5, 41.9] },
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  expect((await (await GET(request("Game cafe"))).json()).items).toEqual([
    { id: "place.1", address: "123 Main St", longitude: 12.5, latitude: 41.9 },
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("never returns more than five results even if upstream over-delivers", async () => {
  mocks.auth.mockResolvedValue({ userId: "user_admin" });
  process.env.MAPBOX_GEOCODING_TOKEN = "test-token";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        features: Array.from({ length: 6 }, (_, i) => ({
          properties: { mapbox_id: `place.${i}`, full_address: `${i} Main St` },
          geometry: { coordinates: [12.5, 41.9] },
        })),
      }),
    ),
  );
  expect((await (await GET(request("Main Street"))).json()).items).toHaveLength(5);
});

it("does not expose upstream errors or invalid results", async () => {
  mocks.auth.mockResolvedValue({ userId: "user_admin" });
  process.env.MAPBOX_GEOCODING_TOKEN = "test-token";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("Permanent geocoding not enabled", { status: 403 })),
  );
  expect((await GET(request("Game cafe"))).status).toBe(502);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        features: [
          { properties: { mapbox_id: "place.1" }, geometry: { coordinates: [12.5, 41.9] } },
        ],
      }),
    ),
  );
  expect((await (await GET(request("Game cafe"))).json()).items).toEqual([]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ features: [{ bad: true }] })));
  expect((await GET(request("Game cafe"))).status).toBe(502);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret upstream details")));
  const response = await GET(request("Game cafe"));
  expect(response.status).toBe(502);
  expect(JSON.stringify(await response.json())).not.toContain("secret upstream details");
});
