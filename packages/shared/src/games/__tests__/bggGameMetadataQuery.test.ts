import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import {
  bggGameMetadataQuery,
  gameMetadataMissing,
  mergeBggGameMetadata,
} from "../hooks/useBggGameMetadata";

const clients: QueryClient[] = [];
const options = {
  apiUrl: "https://api.test",
  userId: "owner",
  getToken: async () => "token",
};
const game = (id: number) => ({ id, name: `Game ${id}`, year: 2024, imageUrl: null });

function client() {
  const value = new QueryClient();
  clients.push(value);
  return value;
}

function mockMetadata() {
  const fetch = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const ids = new URL(String(url)).searchParams.get("ids")!.split(",").map(Number);
    return Response.json({ items: ids.map((id) => ({ ...game(id), categories: [] })) });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  for (const value of clients.splice(0)) value.clear();
  vi.unstubAllGlobals();
});

it("only enables missing metadata for a visible game owned by the active actor", () => {
  const c = client();
  const complete = {
    ...game(1),
    categories: [],
    average: 7,
    rank: 200,
    minPlayMinutes: 45,
    maxPlayMinutes: 45,
    suggestedPlayers: { rows: [], totalVotes: 0, fetchedAt: "2026-11-01T00:00:00Z" },
    averageWeight: 3,
  };
  expect(gameMetadataMissing(complete)).toBe(false);
  for (const key of [
    "categories",
    "year",
    "average",
    "rank",
    "minPlayMinutes",
    "maxPlayMinutes",
    "suggestedPlayers",
    "averageWeight",
  ] as const) {
    expect(gameMetadataMissing({ ...complete, [key]: undefined })).toBe(true);
  }
  expect(bggGameMetadataQuery(c, options, complete, true).enabled).toBe(false);
  expect(bggGameMetadataQuery(c, options, game(1), false).enabled).toBe(false);
  expect(bggGameMetadataQuery(c, options, undefined, true).enabled).toBe(false);
  expect(bggGameMetadataQuery(c, { ...options, userId: null }, game(1), true).enabled).toBe(false);
  expect(bggGameMetadataQuery(c, { ...options, enabled: false }, game(1), true).enabled).toBe(
    false,
  );
  expect(bggGameMetadataQuery(c, options, game(1), true).enabled).toBe(true);
});

it("batches visible IDs, dedupes consumers and reuses the scoped per-game cache", async () => {
  const fetch = mockMetadata();
  const getToken = vi.fn(async () => "fresh");
  const c = client();
  const a = bggGameMetadataQuery(c, { ...options, getToken }, game(1), true);
  const b = bggGameMetadataQuery(c, { ...options, getToken }, game(2), true);
  expect(await Promise.all([c.fetchQuery(a), c.fetchQuery(b), c.fetchQuery(a)])).toEqual([
    { ...game(1), categories: [] },
    { ...game(2), categories: [] },
    { ...game(1), categories: [] },
  ]);
  expect(await c.fetchQuery(b)).toEqual({ ...game(2), categories: [] });
  expect(fetch).toHaveBeenCalledOnce();
  expect(getToken).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0];
  expect(new URL(String(url)).searchParams.get("ids")).toBe("1,2");
  expect(init?.headers).toMatchObject({ Authorization: "Bearer fresh" });
});

it("does not mix actor, API target or Query-client ownership when composing a batch", async () => {
  const fetch = mockMetadata();
  const c = client(),
    otherClient = client();
  const second = { ...options, userId: "other", getToken: async () => "other-token" };
  const third = { ...options, apiUrl: "https://preview.test", protectionBypass: "fixture" };
  const scopes = [
    [c, options],
    [c, second],
    [c, third],
    [otherClient, options],
  ] as const;
  await Promise.all(
    scopes.map(([scope, source]) =>
      scope.fetchQuery(bggGameMetadataQuery(scope, source, game(1), true)),
    ),
  );
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(fetch.mock.calls.map(([, init]) => init?.headers)).toContainEqual(
    expect.objectContaining({ Authorization: "Bearer other-token" }),
  );
  expect(fetch.mock.calls.map(([url]) => String(url))).toContain(
    "https://preview.test/api/bgg/thing?ids=1&x-vercel-protection-bypass=fixture",
  );
});

it("drops a cancelled ID before dispatch and continues an independently visible game", async () => {
  const fetch = mockMetadata();
  const c = client();
  const a = bggGameMetadataQuery(c, options, game(1), true);
  const b = bggGameMetadataQuery(c, options, game(2), true);
  const cancelled = c.fetchQuery(a).catch(() => undefined);
  const retained = c.fetchQuery(b);
  await c.cancelQueries({ queryKey: a.queryKey, exact: true });
  expect(await cancelled).toBeUndefined();
  expect(await retained).toEqual({ ...game(2), categories: [] });
  expect(fetch).toHaveBeenCalledOnce();
  expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("ids")).toBe("2");
});

it("aborts the network read when all of its batched members are cancelled", async () => {
  const c = client();
  let onStarted = (_signal: AbortSignal) => {};
  const started = new Promise<AbortSignal>((resolve) => {
    onStarted = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, { signal }: { signal: AbortSignal }) => {
      onStarted(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Abort")), { once: true });
      });
    }),
  );
  const a = c.fetchQuery(bggGameMetadataQuery(c, options, game(1), true)).catch(() => undefined);
  const b = c.fetchQuery(bggGameMetadataQuery(c, options, game(2), true)).catch(() => undefined);
  const signal = await started;
  await c.cancelQueries({ queryKey: ["bgg-game-metadata"] });
  expect(signal.aborted).toBe(true);
  await Promise.all([a, b]);
});

it("separates requests larger than the provider batch limit", async () => {
  const fetch = mockMetadata();
  const c = client();
  const queries = Array.from({ length: 21 }, (_, i) =>
    bggGameMetadataQuery(c, options, game(i + 1), true),
  );
  await Promise.all(queries.map((query) => c.fetchQuery(query)));
  expect(fetch.mock.calls).toHaveLength(2);
  expect(
    fetch.mock.calls.map(
      ([url]) => new URL(String(url)).searchParams.get("ids")?.split(",").length,
    ),
  ).toEqual([20, 1]);
});

it("reports a missing catalog row individually and transports auth errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [game(1)] })),
  );
  const c = client();
  const a = bggGameMetadataQuery(c, options, game(1), true);
  const b = bggGameMetadataQuery(c, options, game(2), true);
  const [found, absent] = await Promise.allSettled([c.fetchQuery(a), c.fetchQuery(b)]);
  expect(found).toEqual({ status: "fulfilled", value: game(1) });
  expect(absent).toMatchObject({ status: "rejected", reason: { status: 404 } });
  const wrongOwner = bggGameMetadataQuery(
    c,
    { ...options, getToken: async () => null },
    game(3),
    true,
  );
  await expect(c.fetchQuery(wrongOwner)).rejects.toMatchObject({ status: 401 });
});

it("merges only known metadata for the same title and preserves its source identity and cover", () => {
  const collectionGame = {
    ...game(1),
    imageUrl: "https://cf.geekdo-images.com/valid.jpg",
    year: 1995,
    rank: 123,
    source: "collection" as const,
    userRating: 8,
  };
  const details = {
    ...game(1),
    name: "Canonical name",
    year: null,
    rank: null,
    imageUrl: null,
    averageWeight: 2,
    categories: [],
  };
  expect(mergeBggGameMetadata(collectionGame, details)).toEqual({
    ...collectionGame,
    averageWeight: 2,
    categories: [],
  });
  expect(mergeBggGameMetadata(collectionGame, undefined)).toBe(collectionGame);
  expect(mergeBggGameMetadata(collectionGame, { ...details, id: 5 })).toBe(collectionGame);
});
