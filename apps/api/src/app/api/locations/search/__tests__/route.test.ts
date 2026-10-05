import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../route";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
const originalKey = process.env.MAPTILER_GEOCODING_KEY;
const request = (query: string) =>
  new Request(`http://localhost/api/locations/search?query=${encodeURIComponent(query)}`);
afterEach(() => {
  if (originalKey === undefined) delete process.env.MAPTILER_GEOCODING_KEY;
  else process.env.MAPTILER_GEOCODING_KEY = originalKey;
  vi.unstubAllGlobals();
  mocks.auth.mockReset();
});

it("requires authentication, a valid query and configured geocoding", async () => {
  mocks.auth.mockResolvedValueOnce({ userId: null });
  expect((await GET(request("Rome"))).status).toBe(401);
  mocks.auth.mockResolvedValue({ userId: "user_admin" });
  expect((await GET(request("Rom"))).status).toBe(400);
  delete process.env.MAPTILER_GEOCODING_KEY;
  expect((await GET(request("Rome"))).status).toBe(503);
});

it("requests at most five MapTiler addresses and returns only match location fields", async () => {
  mocks.auth.mockResolvedValue({ userId: "user_admin" });
  process.env.MAPTILER_GEOCODING_KEY = "test-key";
  const fetchMock = vi.fn().mockImplementation(async (url: URL, options: RequestInit) => {
    expect(url.origin).toBe("https://api.maptiler.com");
    expect(url.pathname).toBe("/geocoding/Main%20St%2F%20Rome.json");
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("types")).toBe("address");
    expect(options.cache).toBe("no-store");
    return Response.json({
      features: [
        {
          id: "address.1",
          place_name: "123 Main St, Rome, Italy",
          place_type: ["address"],
          center: [12.5, 41.9],
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  expect((await (await GET(request("Main St/ Rome"))).json()).items).toEqual([
    { id: "address.1", address: "123 Main St, Rome, Italy", longitude: 12.5, latitude: 41.9 },
  ]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("filters non-address results and caps even an over-delivering provider", async () => {
  mocks.auth.mockResolvedValue({ userId: "user_admin" });
  process.env.MAPTILER_GEOCODING_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        features: [
          { id: "place.1", place_name: "Rome", place_type: ["place"], center: [12.5, 41.9] },
          ...Array.from({ length: 6 }, (_, i) => ({
            id: `address.${i}`,
            place_name: `${i} Main St`,
            place_type: ["address"],
            center: [12.5, 41.9],
          })),
        ],
      }),
    ),
  );
  const { items } = await (await GET(request("Main Street"))).json();
  expect(items).toHaveLength(5);
  expect(items.map((item: { id: string }) => item.id)).toEqual(
    Array.from({ length: 5 }, (_, i) => `address.${i}`),
  );
});

it("does not expose upstream errors or invalid coordinates", async () => {
  mocks.auth.mockResolvedValue({ userId: "user_admin" });
  process.env.MAPTILER_GEOCODING_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("Invalid provider key", { status: 403 })),
  );
  expect((await GET(request("Game cafe"))).status).toBe(502);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        features: [
          {
            id: "address.1",
            place_name: "123 Main St",
            place_type: ["address"],
            center: [12.5, 91],
          },
        ],
      }),
    ),
  );
  expect((await GET(request("Game cafe"))).status).toBe(502);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret upstream details")));
  const response = await GET(request("Game cafe"));
  expect(response.status).toBe(502);
  expect(JSON.stringify(await response.json())).not.toContain("secret upstream details");
});
