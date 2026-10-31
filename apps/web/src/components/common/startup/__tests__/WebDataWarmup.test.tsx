import {
  bggAccountQuery,
  eventRecordQuery,
  eventRecordsQuery,
  favoriteLocationsQuery,
  groupRecordsPageQuery,
  notificationListKey,
  recordTablesQuery,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebDataWarmup } from "../WebDataWarmup";

const state = vi.hoisted(() => ({
  isLoaded: true,
  userId: "user_1" as string | null,
  sessionId: "sess_1" as string | null,
  getToken: async () => "fresh-jwt",
  pathname: "/tables",
  locale: "en",
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => state }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@lingui/react", () => ({ useLingui: () => ({ i18n: { locale: state.locale } }) }));
const clients: QueryClient[] = [];
const o = {
  apiUrl: "https://api.example.test",
  userId: "user_1",
  getToken: state.getToken,
  locale: "en" as const,
};
function response(input: string | URL | Request) {
  const url = new URL(String(input));
  return new Response(
    JSON.stringify(
      url.pathname.endsWith("/profiles")
        ? { id: "user_1" }
        : url.pathname === "/api/tables"
          ? {
              items: ["one", "two", "three"].map((id) => ({ id, eventId: id })),
              nextCursor: "later",
            }
          : url.pathname.endsWith("/account")
            ? { active: null, pending: null }
            : url.pathname.endsWith("/notifications")
              ? { notifications: [], unreadCount: 0, nextCursor: "later" }
              : url.pathname.endsWith("/suggestions")
                ? { users: [], hasContacts: false, nextCursor: "later" }
                : url.pathname.endsWith("/relationships")
                  ? { rows: [], nextCursor: "later" }
                  : { items: [], nextCursor: "later" },
    ),
  );
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 300_000 } },
  });
  clients.push(client);
  const tree = () => (
    <QueryClientProvider client={client}>
      <WebDataWarmup />
    </QueryClientProvider>
  );
  return { client, tree };
}
beforeEach(() => {
  Object.assign(state, {
    isLoaded: true,
    userId: "user_1",
    sessionId: "sess_1",
    pathname: "/tables",
    locale: "en",
  });
  vi.stubEnv("NEXT_PUBLIC_API_URL", o.apiUrl);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("warms priority first pages then other read families and two bounded event details", async () => {
  const fetch = vi.fn(async (input: string | URL | Request) => response(input));
  vi.stubGlobal("fetch", fetch);
  const { client, tree } = setup();
  render(tree());
  await waitFor(() =>
    expect(client.getQueryData(eventRecordQuery(o, "two").queryKey)).toBeDefined(),
  );
  for (const key of [
    recordTablesQuery(o, null).queryKey,
    groupRecordsPageQuery(o).queryKey,
    eventRecordsQuery(o).queryKey,
    favoriteLocationsQuery(o).queryKey,
    bggAccountQuery(o).queryKey,
    notificationListKey(o, 20),
    notificationListKey(o, 3),
  ])
    expect(client.getQueryData(key)).toBeDefined();
  for (const type of ["friends", "pending", "following", "followers", "sent", "blocked"])
    expect(client.getQueryData(["contacts", type, o.apiUrl, o.userId])).toBeDefined();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(19));
  expect(client.getQueryData(eventRecordQuery(o, "three").queryKey)).toBeUndefined();
  expect(fetch.mock.calls.every(([url]) => !String(url).includes("cursor="))).toBe(true);
});

it("keeps background reads running when navigation changes after warmup starts", async () => {
  let release!: () => void;
  const fetch = vi.fn(async (input: string | URL | Request) => {
    if (String(input).includes("/locations/favorites"))
      await new Promise<void>((done) => {
        release = done;
      });
    return response(input);
  });
  vi.stubGlobal("fetch", fetch);
  const { client, tree } = setup();
  const view = render(tree());
  await waitFor(() => expect(release).toBeDefined());
  state.pathname = "/events/one";
  view.rerender(tree());
  release();
  await waitFor(() => expect(client.getQueryData(notificationListKey(o, 20))).toBeDefined());
  expect(
    fetch.mock.calls.filter(([url]) => String(url).includes("/locations/favorites")),
  ).toHaveLength(1);
});

it("clears private cache and stops the remaining background queue on sign-out", async () => {
  let signal: AbortSignal | null | undefined;
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes("/locations/favorites"))
      return new Promise<Response>((_resolve, reject) => {
        signal = init?.signal;
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    return response(input);
  });
  vi.stubGlobal("fetch", fetch);
  const { client, tree } = setup();
  const view = render(tree());
  await waitFor(() => expect(signal).toBeDefined());
  state.userId = null;
  state.sessionId = null;
  view.rerender(tree());
  await waitFor(() => expect(signal?.aborted).toBe(true));
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(fetch.mock.calls.some(([url]) => String(url).includes("/bgg/account"))).toBe(false);
});

it("gives a cold detail deep link five seconds before starting unrelated priority reads", async () => {
  vi.useFakeTimers();
  state.pathname = "/events/one";
  const fetch = vi.fn(async (input: string | URL | Request) => response(input));
  vi.stubGlobal("fetch", fetch);
  const { tree } = setup();
  render(tree());
  await vi.advanceTimersByTimeAsync(4999);
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
});

it("does not let a hung priority read starve background APIs beyond the five-second budget", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(input)).pathname === "/api/tables")
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    return response(input);
  });
  vi.stubGlobal("fetch", fetch);
  const { client, tree } = setup();
  render(tree());
  await vi.advanceTimersByTimeAsync(1);
  expect(client.getQueryData(favoriteLocationsQuery(o).queryKey)).toBeUndefined();
  await vi.advanceTimersByTimeAsync(5000);
  await vi.waitFor(() => expect(client.getQueryData(notificationListKey(o, 20))).toBeDefined());
});
