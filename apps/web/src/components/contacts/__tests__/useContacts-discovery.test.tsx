import { type ContactUser, useContacts } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const api = "https://api.test",
  actor = "viewer";
const target: ContactUser = {
  id: "target",
  name: "Mario Rossi",
  email: "mario@example.test",
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2030-01-01T00:00:00Z" },
  isFollowing: true,
  isFriend: true,
};
const clients: QueryClient[] = [];
function setup(isFriend = true) {
  const cachedUser = { ...target, isFriend };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const getToken = vi.fn(async () => "fresh-token");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  for (const base of [api, "https://foreign.test"])
    for (const owner of [actor, "foreign-owner"]) {
      for (const view of ["following", "followers", "friends", "pending", "sent", "blocked"])
        client.setQueryData(["contacts", view, base, owner], {
          pages: [
            {
              rows:
                view === "following" || (view === "friends" && isFriend)
                  ? [{ fromUserId: owner, toUserId: target.id, profile: cachedUser }]
                  : [],
              nextCursor: null,
            },
          ],
          pageParams: [""],
        });
      client.setQueryData(["contacts", "suggestions", base, owner], {
        pages: [{ users: [], hasContacts: true, nextCursor: null }],
        pageParams: [""],
      });
      client.setQueryData(["contacts", "search:Mario", base, owner], { users: [cachedUser] });
    }
  return { client, getToken, wrapper };
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});
it.each(["unfriend", "unfollow"] as const)(
  "refreshes loaded discovery after %s from another hook, without reopening tabs or refreshing unrelated owners/APIs",
  async (action) => {
    const { client, getToken, wrapper } = setup(action === "unfriend");
    let following = true,
      friend = action === "unfriend",
      finish: ((response: Response) => void) | undefined;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      const user = { ...target, isFollowing: following, isFriend: friend };
      if (url.includes("/users/suggestions"))
        return Response.json({
          users: following ? [] : [user],
          hasContacts: true,
          nextCursor: null,
        });
      if (url.includes("/users/search")) return Response.json({ users: [user] });
      return Response.json({ rows: [], nextCursor: null });
    });
    vi.stubGlobal("fetch", fetch);
    const screen = renderHook(() => useContacts(api, "snapshot", getToken, undefined, actor), {
      wrapper,
    });
    const foreignApi = renderHook(
      () => useContacts("https://foreign.test", "snapshot", getToken, undefined, actor),
      { wrapper },
    );
    const foreignOwner = renderHook(
      () => useContacts(api, "snapshot", getToken, undefined, "foreign-owner"),
      { wrapper },
    );
    act(() => {
      screen.result.current.runSearch("Mario");
      foreignApi.result.current.runSearch("Mario");
      foreignOwner.result.current.runSearch("Mario");
    });
    // Social actions outside Contacts have no local search term or enabled list observers.
    const actions = renderHook(() => useContacts(api, null, getToken, undefined, actor), {
      wrapper,
    });
    expect(screen.result.current.suggestions.data?.users).toEqual([]);
    let pending!: Promise<unknown>;
    act(() => {
      pending = actions.result.current[action].mutateAsync({
        targetUserId: target.id,
        targetUser: target,
      });
    });
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.result.current.following.data).toEqual([]);
    expect(screen.result.current.suggestions.data?.users).toEqual([]);
    const before = fetch.mock.calls.length;
    await act(async () => {
      following = false;
      if (action === "unfriend") friend = false;
      finish?.(Response.json({ ok: true }));
      await pending;
    });
    await waitFor(() =>
      expect(screen.result.current.suggestions.data?.users).toMatchObject([
        { id: target.id, isFollowing: false },
      ]),
    );
    await waitFor(() =>
      expect(screen.result.current.search.data?.users).toMatchObject([
        { id: target.id, isFollowing: false },
      ]),
    );
    const reads = fetch.mock.calls
      .slice(before)
      .filter(([, init]) => !init?.method || init.method === "GET");
    expect(reads.some(([url]) => url.includes("/users/suggestions"))).toBe(true);
    expect(reads.some(([url]) => url.includes("/users/search"))).toBe(true);
    expect(reads.every(([url]) => url.startsWith(api) && !url.includes("/relationships"))).toBe(
      true,
    );
    expect(foreignApi.result.current.suggestions.data?.users).toEqual([]);
    expect(foreignOwner.result.current.suggestions.data?.users).toEqual([]);
    act(() => screen.result.current.runSearch("Mario"));
    expect(screen.result.current.suggestions.data?.users).toHaveLength(1);
    expect(getToken).toHaveBeenCalled();
  },
);
it("does not invent address-book eligibility when removal commits but the discovery read fails", async () => {
  const { wrapper } = setup();
  let saved = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        saved = true;
        return Response.json({ ok: true });
      }
      if (url.includes("/users/suggestions") && saved) throw new Error("Discovery unavailable");
      return Response.json({ rows: [], nextCursor: null });
    }),
  );
  const hook = renderHook(
    () => useContacts(api, "snapshot", async () => "fresh", undefined, actor),
    { wrapper },
  );
  await act(async () => {
    await hook.result.current.unfriend.mutateAsync({ targetUserId: target.id, targetUser: target });
  });
  await waitFor(() => expect(hook.result.current.suggestions.isError).toBe(true));
  expect(hook.result.current.suggestions.data?.users).toEqual([]);
  expect(hook.result.current.following.data).toEqual([]);
  expect(hook.result.current.unfriend.isSuccess).toBe(true);
});
