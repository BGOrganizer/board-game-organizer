import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { bggCollectionQuery } from "../hooks/useBggCollection";

const clients: QueryClient[] = [];
const options = {
  apiUrl: "https://api.test",
  userId: "owner",
  getToken: async () => "token",
  snapshot: "snapshot",
  query: " Chess ",
};
const data = {
  snapshot: "snapshot",
  counts: { withoutExpansions: 1, withExpansions: 2, wishlist: 1 },
  items: [],
  nextCursor: null,
};
function client() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(c);
  return c;
}
afterEach(() => {
  for (const c of clients.splice(0)) c.clear();
  vi.unstubAllGlobals();
});
it("scopes owner/API/snapshot/filter rather than session tokens and obtains a fresh token every read", async () => {
  const fetch = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json(data));
  vi.stubGlobal("fetch", fetch);
  const getToken = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("rotated");
  const q = bggCollectionQuery({ ...options, getToken, protectionBypass: "bypass" });
  expect(q.queryKey).toEqual(["bgg-collection", "https://api.test", "owner", "snapshot", "Chess"]);
  const c = client();
  await c.fetchInfiniteQuery({ ...q, staleTime: 0 });
  await c.fetchInfiniteQuery({ ...q, staleTime: 0 });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("query")).toBe("Chess");
  expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("snapshot")).toBe("snapshot");
  expect(String(fetch.mock.calls[0][0])).toContain("x-vercel-protection-bypass");
  expect(fetch.mock.calls.map(([, init]) => (init as RequestInit).headers)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ Authorization: "Bearer first" }),
      expect.objectContaining({ Authorization: "Bearer rotated" }),
    ]),
  );
  expect(bggCollectionQuery({ ...options, userId: null }).enabled).toBe(false);
  expect(bggCollectionQuery({ ...options, snapshot: null }).enabled).toBe(false);
});
it.each([401, 404, 409, 503])(
  "keeps collection HTTP %s observable rather than returning an empty page",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "unavailable" }, { status })),
    );
    await expect(
      client().fetchInfiniteQuery({ ...bggCollectionQuery(options), retry: false }),
    ).rejects.toMatchObject({ status });
  },
);
it("rejects responses from another snapshot", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ...data, snapshot: "other" })),
  );
  await expect(client().fetchInfiniteQuery(bggCollectionQuery(options))).rejects.toMatchObject({
    status: 409,
  });
});
it("never sends a request without a session token", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    client().fetchInfiniteQuery(bggCollectionQuery({ ...options, getToken: async () => null })),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled();
});
it("cancels a late token lookup before network dispatch", async () => {
  let finish: (value: string) => void = () => {};
  const getToken = () =>
    new Promise<string>((resolve) => {
      finish = resolve;
    });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const c = client();
  const pending = c.fetchInfiniteQuery(bggCollectionQuery({ ...options, getToken }));
  const cancelled = expect(pending).rejects.toBeDefined();
  await c.cancelQueries();
  finish("late");
  await cancelled;
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
});
