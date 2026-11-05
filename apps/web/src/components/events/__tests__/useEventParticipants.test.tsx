import {
  clearSessionQueryCache,
  eventParticipantsQuery,
  useEventParticipants,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const o = { apiUrl: "https://api.test", userId: "owner", getToken: async () => "fresh" };
const page = (id: string, nextCursor: string | null = null) => ({
  items: [
    {
      id,
      userId: id,
      name: id,
      username: id,
      avatarUrl: null,
      position: "WAITING" as const,
      canRemove: false,
      canBanGroup: false,
    },
  ],
  eventVersion: 1,
  groupId: null,
  status: "PLANNING" as const,
  nextCursor,
});
const clients: QueryClient[] = [];
function setup(pages = [page("first")]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(eventParticipantsQuery(o, "event").queryKey, {
    pages,
    pageParams: pages.map((_p, i) => String(i)),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(({ id, userId }) => useEventParticipants({ ...o, userId }, id), {
    wrapper,
    initialProps: { id: "event", userId: "owner" },
  });
  return { client, ...hook };
}
afterEach(() => {
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});
it("presents one cached source page, ignores layout-only end callbacks and grows once per committed viewport", () => {
  const hidden = page("hidden");
  const getter = vi.fn(() => [page("second").items[0]]);
  Object.defineProperty(hidden, "items", { get: getter });
  const h = setup([page("first"), hidden, page("third")]);
  expect(h.result.current.items.map((p) => p.id)).toEqual(["first"]);
  expect(getter).not.toHaveBeenCalled();
  act(() => h.result.current.endReached());
  expect(h.result.current.items).toHaveLength(1);
  const more = h.result.current.loadMore;
  act(() => {
    more();
    more();
  });
  expect(h.result.current.items.map((p) => p.id)).toEqual(["first", "second"]);
  act(() => {
    h.result.current.beginScroll();
    h.result.current.endReached();
  });
  expect(h.result.current.items.map((p) => p.id)).toEqual(["first", "second", "third"]);
  expect(h.result.current.hasMore).toBe(false);
  act(() => h.result.current.loadMore());
  expect(h.result.current.items).toHaveLength(3);
});
it("resets actor/resource windows and rejects stale and post-unmount callbacks", () => {
  const fetch = vi.fn(async () => Response.json(page("remote")));
  vi.stubGlobal("fetch", fetch);
  const h = setup([page("first"), page("second")]);
  const stale = h.result.current.loadMore;
  h.client.setQueryData(eventParticipantsQuery({ ...o, userId: "other" }, "changed").queryKey, {
    pages: [page("other-first"), page("other-second")],
    pageParams: ["", "next"],
  });
  h.rerender({ id: "changed", userId: "other" });
  act(() => stale());
  expect(h.result.current.items.map((p) => p.id)).toEqual(["other-first"]);
  act(() => h.result.current.endReached());
  expect(h.result.current.items).toHaveLength(1);
  const closed = h.result.current.loadMore,
    scroll = h.result.current.beginScroll;
  h.unmount();
  act(() => {
    closed();
    scroll();
  });
  expect(fetch).not.toHaveBeenCalled();
});
it("fetches further pages with a fresh token and cancellation, retaining a visible failure instead of empty success", async () => {
  const fetch = vi.fn(async () => Response.json(page("remote")));
  vi.stubGlobal("fetch", fetch);
  const h = setup([page("first", "cursor")]);
  act(() => {
    h.result.current.beginScroll();
    h.result.current.endReached();
  });
  await waitFor(() => expect(h.result.current.items).toHaveLength(2));
  expect(fetch).toHaveBeenCalledWith(
    "https://api.test/api/events/event/participants?limit=20&cursor=cursor",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer fresh" }),
      signal: expect.any(AbortSignal),
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "Denied" }, { status: 403 })),
  );
  await act(async () => {
    await h.result.current.refetch();
  });
  await waitFor(() => expect(h.result.current.isError).toBe(true));
  expect(h.result.current.items).toEqual([]);
  act(() => h.result.current.loadMore());
  h.unmount();
});
