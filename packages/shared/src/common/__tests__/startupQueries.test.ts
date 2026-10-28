import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { eventRecordsQuery, recordTablesQuery } from "../../events/hooks/useEventRecords";
import { bggAccountQuery } from "../../games/hooks/useBggAccount";
import { bggPickerQuery } from "../../games/hooks/useBggPicker";
import { groupRecordsPageQuery } from "../../groups/hooks/useGroupRecords";
import { favoriteLocationsQuery } from "../../locations/hooks/useFavoriteLocations";
import { notificationListKey } from "../../notifications/hooks/useNotifications";
import {
  startupRelationshipTypes,
  warmStartupBackground,
  warmStartupPriority,
} from "../startupQueries";

const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 300_000 } },
  });
  clients.push(client);
  let token = 0;
  const getToken = vi.fn(async () => `fresh-${++token}`);
  return {
    client,
    options: {
      apiUrl: "https://api.example.test",
      userId: "user-1",
      getToken,
      locale: "it" as const,
      protectionBypass: "test-bypass",
    },
  };
}
function body(url: URL) {
  if (url.pathname === "/api/profiles") return { id: "user-1" };
  if (url.pathname === "/api/tables")
    return {
      items: ["one", "two", "three", "one"].map((id) => ({ id, eventId: id })),
      nextCursor: "later",
    };
  if (url.pathname === "/api/groups")
    return {
      items: [
        { id: "pending", canViewMembers: false, canViewEvents: false },
        { id: "member", canViewMembers: true, canViewEvents: true },
        { id: "outside-budget", canViewMembers: true, canViewEvents: true },
      ],
      nextCursor: "later",
    };
  if (url.pathname === "/api/events" && !url.searchParams.has("groupId"))
    return { items: [{ id: "four" }], nextCursor: "later" };
  if (url.pathname === "/api/bgg/account")
    return {
      active: { username: "test", snapshot: "snapshot-1" },
      pending: { status: "syncing" },
    };
  if (url.pathname === "/api/notifications")
    return { notifications: [], unreadCount: 4, nextCursor: "later" };
  if (url.pathname === "/api/users/suggestions")
    return { users: [], hasContacts: false, nextCursor: "later" };
  if (url.pathname === "/api/relationships") return { rows: [], nextCursor: "later" };
  return { items: [], nextCursor: "later" };
}
function fetcher() {
  return vi.fn(
    async (input: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body(new URL(input)))),
  );
}
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

it("starts only the four priority reads with at most three concurrent requests", async () => {
  const { client, options } = setup();
  const release: (() => void)[] = [];
  const fetch = vi.fn(async (input: string, _init?: RequestInit) => {
    if (release.length < 3) await new Promise<void>((resolve) => release.push(resolve));
    return new Response(JSON.stringify(body(new URL(input))));
  });
  vi.stubGlobal("fetch", fetch);
  const warm = warmStartupPriority(client, options, () => true);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    "/api/tables",
    "/api/groups",
    "/api/events",
  ]);
  for (const done of release) done();
  await warm;
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(client.getQueryData(["profile", options.apiUrl, options.userId])).toBeDefined();
});

it("progressively warms scoped first pages, linked events and authorized groups, never mutations or arbitrary searches", async () => {
  const { client, options } = setup();
  const fetch = fetcher();
  const prefetch = vi.spyOn(client, "prefetchInfiniteQuery");
  vi.stubGlobal("fetch", fetch);
  await warmStartupPriority(client, options, () => true);
  await warmStartupBackground(client, options, () => true);
  expect(fetch).toHaveBeenCalledTimes(23);
  expect(options.getToken).toHaveBeenCalledTimes(23);
  expect(client.getQueryData(favoriteLocationsQuery(options).queryKey)).toMatchObject({
    pages: [{ items: [], nextCursor: "later" }],
    pageParams: [""],
  });
  expect(client.getQueryData(notificationListKey(options, 20))).toBeDefined();
  expect(client.getQueryData(notificationListKey(options, 3))).toBeDefined();
  for (const type of startupRelationshipTypes)
    expect(client.getQueryData(["contacts", type, options.apiUrl, options.userId])).toBeDefined();
  for (const search of [true, false])
    expect(
      client.getQueryData(
        bggPickerQuery({
          ...options,
          query: "",
          search,
          collection: true,
          snapshot: "snapshot-1",
        }).queryKey,
      ),
    ).toBeDefined();
  for (const [query] of prefetch.mock.calls) {
    if (query.queryKey[0] !== "contacts") continue;
    const page = { rows: [], users: [], hasContacts: false, nextCursor: "next" };
    expect(query.getNextPageParam?.(page, [page], "", [""])).toBe("next");
    expect(query.getNextPageParam?.({ ...page, nextCursor: null }, [], "", [])).toBeUndefined();
  }
  const urls = fetch.mock.calls.map(([url]) => new URL(url));
  expect(urls.filter((url) => url.pathname.startsWith("/api/bgg/picker"))).toHaveLength(2);
  expect(urls.some((url) => /three|four|pending\/|outside-budget/.test(url.pathname))).toBe(false);
  expect(
    urls.filter((url) => url.pathname.endsWith("/members")).map((url) => url.pathname),
  ).toEqual(["/api/groups/member/members"]);
  expect(urls.some((url) => url.searchParams.get("groupId") === "member")).toBe(true);
  expect(urls.every((url) => !url.searchParams.has("cursor"))).toBe(true);
  expect(
    urls.every((url) => url.searchParams.get("x-vercel-protection-bypass") === "test-bypass"),
  ).toBe(true);
  expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  for (const [url, init] of fetch.mock.calls)
    if (new URL(url).pathname !== "/api/profiles") expect(init?.signal).toBeInstanceOf(AbortSignal);
  const headers = fetch.mock.calls.map(([, init]) =>
    new Headers(init?.headers).get("Authorization"),
  );
  expect(new Set(headers).size).toBe(23);
  expect(
    client.getQueryData(["contacts", "suggestions", options.apiUrl, options.userId]),
  ).toBeDefined();
  expect(client.getQueryData(["contacts", "suggestions", options.apiUrl, "other"])).toBeUndefined();
  expect(
    client
      .getQueryCache()
      .getAll()
      .every((query) => !JSON.stringify(query.queryKey).includes("fresh-")),
  ).toBe(true);
  await warmStartupPriority(client, options, () => true);
  await warmStartupBackground(client, options, () => true);
  expect(fetch).toHaveBeenCalledTimes(23);
});

it("isolates background network failures without caching fabricated success or triggering BGG synchronization", async () => {
  const { client, options } = setup();
  const fetch = vi.fn(async (input: string, _init?: RequestInit) => {
    const url = new URL(input);
    return url.pathname === "/api/bgg/account"
      ? new Response("offline", { status: 503 })
      : new Response(JSON.stringify(body(url)));
  });
  vi.stubGlobal("fetch", fetch);
  await warmStartupBackground(client, options, () => true);
  expect(client.getQueryState(bggAccountQuery(options).queryKey)?.status).toBe("error");
  expect(client.getQueryData(bggAccountQuery(options).queryKey)).toBeUndefined();
  expect(client.getQueryData(notificationListKey(options, 20))).toBeDefined();
  expect(fetch).toHaveBeenCalledTimes(11);
  expect(fetch.mock.calls.some(([url]) => /picker|sync/.test(new URL(url).pathname))).toBe(false);
});

it("does not start any queued read after session cancellation, and aborts the active request when private cache clears", async () => {
  const { client, options } = setup();
  let active = true;
  let signal: AbortSignal | undefined;
  const fetch = vi.fn(
    (_input: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        signal = init?.signal ?? undefined;
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const warm = warmStartupBackground(client, options, () => active);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  active = false;
  client.clear();
  await warm;
  expect(signal?.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  await warmStartupPriority(client, options, () => false);
  await warmStartupBackground(client, options, () => false);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("handles absent, empty and unlinked cached datasets without guessing IDs or starting a collection search", async () => {
  const { client, options } = setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ active: null, pending: null }))),
  );
  for (const query of [
    recordTablesQuery(options, null),
    eventRecordsQuery(options),
    groupRecordsPageQuery(options),
  ])
    client.setQueryData(query.queryKey, { pages: [], pageParams: [] });
  await warmStartupBackground(client, options, () => true);
  expect(client.getQueryData(bggAccountQuery(options).queryKey)).toMatchObject({ active: null });
});
