import type { BggPickerItem } from "@board-game-organizer/schemas";
import {
  bggPickerQuery,
  bggPickerUnavailable,
  CommunityApiError,
  useBggPicker,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Options = Parameters<typeof useBggPicker>[0];
const API = "https://picker-fixtures.test";
const otherAPI = "https://other-picker-fixtures.test";
const base: Options = {
  apiUrl: API,
  userId: "viewer",
  getToken: async () => "fresh",
  query: "Game",
  collection: false,
};
const game = (id: number): BggPickerItem => ({
  id,
  name: `Game ${id}`,
  year: null,
  imageUrl: null,
  source: "search",
});
const clients = new Set<QueryClient>();
let respond: (url: URL, init?: RequestInit) => Promise<Response>;
let fetcher: ReturnType<
  typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>
>;
beforeEach(() => {
  respond = async () => Response.json({ items: [game(1)], nextCursor: null });
  fetcher = vi.fn(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (![API, otherAPI].includes(url.origin) || url.pathname !== "/api/bgg/picker")
      throw new Error(`Unexpected picker HTTP request: ${url.href}`);
    expect(init?.method).toBe("GET");
    return respond(url, init);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  for (const client of clients) client.clear();
  clients.clear();
  vi.unstubAllGlobals();
});
function setup(options: Options = base) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.add(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook((current: Options) => useBggPicker(current), { wrapper, initialProps: options }),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("publishes an authorized empty picker page as successful exhaustion", async () => {
  respond = async () => Response.json({ items: [], nextCursor: null });
  const h = setup();
  await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
  expect(h.result.current.data?.pages).toEqual([{ items: [], nextCursor: null }]);
  expect(h.result.current.hasNextPage).toBe(false);
  expect(h.result.current.isError).toBe(false);
});

it("mounts the actual observer with actor/API/proposal scope and resolves a fresh token for each request", async () => {
  const getToken = vi.fn().mockResolvedValueOnce("first").mockResolvedValue("second");
  const options = {
    ...base,
    getToken,
    query: " Game ",
    proposalScope: { eventId: "event", tableId: "table" },
  };
  const query = bggPickerQuery(options);
  expect(query.staleTime).toBe(0);
  for (const change of [
    { userId: "other" },
    { apiUrl: otherAPI },
    { proposalScope: { eventId: "other", tableId: "table" } },
    { proposalScope: { eventId: "event", tableId: "other" } },
    { proposalScope: undefined },
  ])
    expect(bggPickerQuery({ ...options, ...change }).queryKey).not.toEqual(query.queryKey);
  const h = setup(options);
  await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
  expect(h.result.current.data?.pages[0].items).toEqual([game(1)]);
  expect(h.client.getQueryCache().find({ queryKey: query.queryKey, exact: true })).toBeDefined();
  await act(async () => {
    await h.result.current.refetch();
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.get("proposalEventId")).toBe("event");
  expect(url.searchParams.get("proposalTableId")).toBe("table");
  expect(url.searchParams.get("query")).toBe("Game");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    signal: expect.any(AbortSignal),
    headers: { Authorization: "Bearer first" },
  });
  expect(fetcher.mock.calls[1][1]).toMatchObject({ headers: { Authorization: "Bearer second" } });
  expect(JSON.stringify(query.queryKey)).not.toContain("first");
  expect(JSON.stringify(query.queryKey)).not.toContain("second");
});

it("keeps catalog fallback independent of the obsolete Search flag and enforces actual source enablement", async () => {
  const h = setup({ ...base, search: false });
  await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
  expect(bggPickerQuery(base).staleTime).toBe(300_000);
  expect(bggPickerQuery({ ...base, search: false }).queryKey).toEqual(
    bggPickerQuery({ ...base, search: true }).queryKey,
  );
  h.rerender({ ...base, search: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
  h.rerender({ ...base, query: "Gam" });
  expect(h.result.current.fetchStatus).toBe("idle");
  expect(fetcher).toHaveBeenCalledTimes(1);
  h.rerender({ ...base, query: "", collection: true });
  expect(h.result.current.fetchStatus).toBe("idle");
  expect(fetcher).toHaveBeenCalledTimes(1);
  h.rerender({ ...base, query: "", collection: true, snapshot: "own" });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
  const own = new URL(String(fetcher.mock.calls[1][0]));
  expect(own.searchParams.get("collection")).toBe("1");
  expect(own.searchParams.get("search")).toBe("0");
  expect(own.searchParams.get("query")).toBe("");
  h.rerender({ ...base, userId: null });
  expect(h.result.current.fetchStatus).toBe("idle");
  h.rerender({ ...base, query: "", participants: true });
  expect(h.result.current.fetchStatus).toBe("idle");
  expect(fetcher).toHaveBeenCalledTimes(2);
  h.rerender({
    ...base,
    query: "",
    participants: true,
    tableScope: { eventId: "event", tableId: "table", groupId: "group" },
  });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
  expect(
    bggPickerQuery({
      ...base,
      participants: true,
      tableScope: { eventId: "event", tableId: "table", groupId: "group" },
    }).queryKey.slice(7),
  ).toEqual([null, "sources-v2", true, { eventId: "event", tableId: "table", groupId: "group" }]);
});

it("forwards selected participant sources and cursor/bypass parameters while keeping Group cache metadata local", async () => {
  respond = async (url) =>
    Response.json({
      items: [game(url.searchParams.has("cursor") ? 2 : 1)],
      nextCursor: url.searchParams.has("cursor") ? null : "cursor",
    });
  const options: Options = {
    ...base,
    collection: true,
    snapshot: "own",
    participants: true,
    tableScope: { eventId: "event", tableId: "table", groupId: "private-group" },
    protectionBypass: "test-bypass",
  };
  expect(bggPickerQuery(options).staleTime).toBe(0);
  const h = setup(options);
  await waitFor(() => expect(h.result.current.hasNextPage).toBe(true));
  await act(async () => {
    await h.result.current.fetchNextPage();
  });
  await waitFor(() =>
    expect(h.result.current.data?.pages.flatMap((page) => page.items)).toEqual([game(1), game(2)]),
  );
  expect(h.result.current.data?.pageParams).toEqual(["", "cursor"]);
  expect(h.result.current.hasNextPage).toBe(false);
  const url = new URL(String(fetcher.mock.calls[1][0]));
  for (const [key, value] of Object.entries({
    search: "0",
    collection: "1",
    participants: "1",
    participantEventId: "event",
    participantTableId: "table",
    cursor: "cursor",
    "x-vercel-protection-bypass": "test-bypass",
  }))
    expect(url.searchParams.get(key)).toBe(value);
  expect(url.href).not.toContain("private-group");
  expect(new Headers(fetcher.mock.calls[1][1]?.headers).has("x-vercel-protection-bypass")).toBe(
    false,
  );
  h.rerender({ ...options, participants: false });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  const deselected = new URL(String(fetcher.mock.calls[2][0]));
  expect(deselected.searchParams.has("participantEventId")).toBe(false);
  expect(deselected.searchParams.has("participantTableId")).toBe(false);
  expect(deselected.searchParams.get("participants")).toBe("0");
});

it.each([
  [undefined, false],
  [new Error("offline"), false],
  [{ status: 403 }, false],
  [new CommunityApiError(401, "UNAUTHORIZED"), true],
  [new CommunityApiError(403, "EVENT_ADMIN_REQUIRED"), true],
  [new CommunityApiError(404, "NOT_FOUND"), true],
  [new CommunityApiError(409, "BGG_PICKER_CHANGED"), true],
  [new CommunityApiError(409, "OTHER"), false],
  [new CommunityApiError(400, "BGG_PICKER_CHANGED"), false],
])(
  "classifies only source-proven revocation or changed-snapshot errors: %s",
  (error, unavailable) => {
    expect(bggPickerUnavailable(error)).toBe(unavailable);
  },
);

it.each([
  { status: 403, code: "EVENT_ADMIN_REQUIRED", unavailable: true },
  { status: 409, code: "BGG_PICKER_CHANGED", unavailable: true },
  { status: 503, code: "UNAVAILABLE", unavailable: false },
])(
  "retains typed $status failures so callers distinguish revoked source data from offline cache",
  async ({ status, code, unavailable }) => {
    const h = setup();
    await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
    const cached = h.result.current.data;
    respond = async () => Response.json({ error: code }, { status });
    await act(async () => {
      await h.result.current.refetch();
    });
    await waitFor(() => expect(h.result.current.isError).toBe(true));
    expect(h.result.current.error).toBeInstanceOf(CommunityApiError);
    expect(h.result.current.error).toMatchObject({ status, code });
    expect(bggPickerUnavailable(h.result.current.error)).toBe(unavailable);
    expect(h.result.current.data).toBe(cached);
  },
);

it("rejects missing tokens and missing users before issuing HTTP with the real Query client", async () => {
  const h = setup({ ...base, getToken: async () => null });
  await waitFor(() => expect(h.result.current.isError).toBe(true));
  expect(h.result.current.error).toMatchObject({ status: 401 });
  await expect(
    h.client.fetchInfiniteQuery(bggPickerQuery({ ...base, userId: null })),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});

it("cancels a real observer waiting for a token and never sends the late credential to HTTP", async () => {
  const token = deferred<string>();
  const getToken = vi.fn(() => token.promise);
  const options = { ...base, getToken };
  const h = setup(options);
  await waitFor(() => expect(getToken).toHaveBeenCalledOnce());
  h.unmount();
  await act(async () => token.resolve("late"));
  expect(fetcher).not.toHaveBeenCalled();
  expect(h.client.getQueryData(bggPickerQuery(options).queryKey)).toBeUndefined();
});

it("retains the query function's AbortError when token resolution discovers cancellation", async () => {
  const controller = new AbortController();
  const query = bggPickerQuery({
    ...base,
    getToken: async () => {
      controller.abort();
      return "late";
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.add(client);
  if (typeof query.queryFn !== "function")
    throw new Error("Expected the actual picker query function");
  await expect(
    query.queryFn({
      client,
      queryKey: query.queryKey,
      pageParam: "",
      signal: controller.signal,
      direction: "forward",
      meta: undefined,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher).not.toHaveBeenCalled();
});

it("keeps a late previous-account HTTP result outside the new account's actual observer/cache", async () => {
  const pending = deferred<Response>();
  respond = async (_url, init) =>
    new Headers(init?.headers).get("Authorization") === "Bearer first-owner"
      ? pending.promise
      : Response.json({ items: [game(2)], nextCursor: null });
  const first = { ...base, userId: "one", getToken: async () => "first-owner" };
  const h = setup(first);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0][1]?.signal;
  h.rerender({ ...base, userId: "two", getToken: async () => "second-owner" });
  await waitFor(() => expect(h.result.current.data?.pages[0].items).toEqual([game(2)]));
  expect(signal?.aborted).toBe(true);
  await act(async () => pending.resolve(Response.json({ items: [game(1)], nextCursor: null })));
  expect(h.result.current.data?.pages[0].items).toEqual([game(2)]);
  expect(h.client.getQueryData(bggPickerQuery(first).queryKey)).toBeUndefined();
});

it("publishes only the selected collection snapshot while retaining each immutable cached source separately", async () => {
  let responseId = 1;
  respond = async () => Response.json({ items: [game(responseId)], nextCursor: null });
  const first = { ...base, collection: true, snapshot: "first", query: "" };
  const h = setup(first);
  await waitFor(() => expect(h.result.current.data?.pages[0].items).toEqual([game(1)]));
  const cache = h.client.getQueryData(bggPickerQuery(first).queryKey);
  responseId = 2;
  h.rerender({ ...first, snapshot: "second", apiUrl: otherAPI });
  await waitFor(() => expect(h.result.current.data?.pages[0].items).toEqual([game(2)]));
  expect(h.client.getQueryData(bggPickerQuery(first).queryKey)).toBe(cache);
  expect(h.result.current.data).not.toBe(cache);
});
