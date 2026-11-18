import type { BggSearchItem, BggThingResponse } from "@board-game-organizer/schemas";
import { beforeEach, expect, it, vi } from "vitest";
import type { gameDetails, searchGames } from "@/app/lib/games/bgg";
import { GET as SEARCH, OPTIONS as SEARCH_OPTIONS } from "../search/route";
import { GET as THING, OPTIONS as THING_OPTIONS } from "../thing/route";

const boundary = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<{ userId: string | null }>>(),
  database: { fixture: "catalog-route-database" },
  getDb: vi.fn(),
  search: vi.fn<typeof searchGames>(),
  details: vi.fn<typeof gameDetails>(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: boundary.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: boundary.getDb }));
vi.mock("@/app/lib/games/bgg", () => ({
  searchGames: boundary.search,
  gameDetails: boundary.details,
}));
const origin = "https://owned-web-preview.vercel.app";
const item: BggSearchItem = {
  id: 42,
  name: "Café strategy",
  year: 2021,
  imageUrl: null,
  average: 7.4,
  bayesAverage: 7.1,
  rank: 200,
};
const details: BggThingResponse = {
  ...item,
  minPlayers: 2,
  maxPlayers: 4,
  minPlayMinutes: 30,
  maxPlayMinutes: 60,
  averageWeight: 2.5,
};
function request(path: "search" | "thing", query: string) {
  return new Request(`http://localhost/api/bgg/${path}?${query}`, { headers: { Origin: origin } });
}
beforeEach(() => {
  vi.clearAllMocks();
  boundary.auth.mockResolvedValue({ userId: "viewer" });
  boundary.getDb.mockResolvedValue(boundary.database);
  boundary.search.mockResolvedValue([item]);
  boundary.details.mockResolvedValue(details);
});

it.each([
  { path: "search" as const, get: SEARCH },
  { path: "thing" as const, get: THING },
])(
  "requires Clerk identity before parsing or reading the $path catalog route",
  async ({ path, get }) => {
    boundary.auth.mockResolvedValueOnce({ userId: null });
    const response = await get(request(path, ""));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(boundary.getDb).not.toHaveBeenCalled();
    expect(boundary.search).not.toHaveBeenCalled();
    expect(boundary.details).not.toHaveBeenCalled();
  },
);

it.each(["", "query=", "query=abc", "query=%20abc%20"])(
  "rejects missing or short trimmed search input: %s",
  async (query) => {
    const response = await SEARCH(request("search", query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Query must be at least 4 characters" });
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(boundary.getDb).not.toHaveBeenCalled();
    expect(boundary.search).not.toHaveBeenCalled();
  },
);

it("passes only the trimmed query to the actual catalog-service boundary and retains complete result metadata", async () => {
  const response = await SEARCH(
    request("search", "query=%20Caf%C3%A9%20&x-vercel-protection-bypass=fixture"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [item] });
  expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  expect(boundary.search).toHaveBeenCalledExactlyOnceWith(boundary.database, "Café");
  expect(boundary.getDb).toHaveBeenCalledOnce();
  expect(boundary.details).not.toHaveBeenCalled();
});

it("returns a real exhausted empty search without interpreting it as an error", async () => {
  boundary.search.mockResolvedValueOnce([]);
  const response = await SEARCH(request("search", "query=none"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [] });
});

it.each(["", "id=", "id=0", "id=-1", "id=1.5", "id=not-a-number", "id=Infinity"])(
  "rejects invalid positive-integer detail identity: %s",
  async (query) => {
    const response = await THING(request("thing", query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid game id" });
    expect(boundary.getDb).not.toHaveBeenCalled();
    expect(boundary.details).not.toHaveBeenCalled();
  },
);

it("coerces a valid scalar game identity and returns hydrated detail metadata with real CORS", async () => {
  const response = await THING(request("thing", "id=%2042%20"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(details);
  expect(boundary.details).toHaveBeenCalledExactlyOnceWith(boundary.database, 42);
  expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  expect(boundary.search).not.toHaveBeenCalled();
});

it.each([
  { failure: new Error("Game 42 not found"), message: "Game 42 not found" },
  { failure: "provider rejected detail", message: "Game not found" },
])(
  "retains the detail route's explicit not-found mapping: $message",
  async ({ failure, message }) => {
    boundary.details.mockRejectedValueOnce(failure);
    const response = await THING(request("thing", "id=42"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: message });
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  },
);

it("does not convert an unavailable search service into an empty successful catalog", async () => {
  const failure = new Error("Catalog unavailable");
  boundary.search.mockRejectedValueOnce(failure);
  await expect(SEARCH(request("search", "query=Azul"))).rejects.toBe(failure);
});

it.each([
  { path: "search" as const, get: SEARCH, query: "query=Azul" },
  { path: "thing" as const, get: THING, query: "id=42" },
])(
  "propagates database acquisition failure before reading $path catalog data",
  async ({ path, get, query }) => {
    const failure = new Error("Database unavailable");
    boundary.getDb.mockRejectedValueOnce(failure);
    await expect(get(request(path, query))).rejects.toBe(failure);
    expect(boundary.search).not.toHaveBeenCalled();
    expect(boundary.details).not.toHaveBeenCalled();
  },
);

it.each([
  { path: "search" as const, get: SEARCH },
  { path: "thing" as const, get: THING },
])(
  "does not fabricate a session after a Clerk provider failure on $path",
  async ({ path, get }) => {
    const failure = new Error("Clerk temporarily unavailable");
    boundary.auth.mockRejectedValueOnce(failure);
    await expect(get(request(path, ""))).rejects.toBe(failure);
    expect(boundary.getDb).not.toHaveBeenCalled();
  },
);

it.each([
  { path: "search" as const, options: SEARCH_OPTIONS },
  { path: "thing" as const, options: THING_OPTIONS },
])(
  "answers a $path browser preflight without requiring authentication or a database",
  async ({ path, options }) => {
    const response = options(request(path, ""));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
    expect(response.headers.get("access-control-allow-methods")).toContain("OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(boundary.auth).not.toHaveBeenCalled();
    expect(boundary.getDb).not.toHaveBeenCalled();
  },
);
