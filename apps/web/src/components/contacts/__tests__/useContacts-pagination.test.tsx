import { useContacts } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("loads social and BGO contacts one page at a time with a fresh JWT", async () => {
  const getToken = vi.fn(async () => "fresh-jwt");
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const cursor = url.searchParams.get("cursor");
    const user = (id: string) => ({
      id,
      name: id,
      email: null,
      avatarUrl: null,
      presence: { online: false, lastActiveAt: "" },
    });
    const body = url.pathname.endsWith("/suggestions")
      ? {
          users: [user(cursor ? "user_b" : "user_a")],
          nextCursor: cursor ? null : "user_a",
          hasContacts: true,
        }
      : url.searchParams.get("type") === "friends"
        ? {
            rows: [
              {
                fromUserId: "viewer",
                toUserId: cursor ? "user_b" : "user_a",
                profile: user(cursor ? "user_b" : "user_a"),
              },
            ],
            nextCursor: cursor ? null : "user_a",
          }
        : { rows: [], nextCursor: null };
    expect(init?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer fresh-jwt" }));
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useContacts("https://api.example.test", "old-jwt", getToken, undefined, "viewer"),
    { wrapper },
  );
  await waitFor(() =>
    expect(result.current.friends.data?.map((row) => row.toUserId)).toEqual(["user_a"]),
  );
  await waitFor(() =>
    expect(result.current.suggestions.data?.users.map((user) => user.id)).toEqual(["user_a"]),
  );
  expect(result.current.friends.hasNextPage).toBe(true);
  await act(async () => {
    await Promise.all([
      result.current.friends.fetchNextPage(),
      result.current.suggestions.fetchNextPage(),
    ]);
  });
  await waitFor(() =>
    expect(result.current.friends.data?.map((row) => row.toUserId)).toEqual(["user_a", "user_b"]),
  );
  await waitFor(() =>
    expect(result.current.suggestions.data?.users.map((user) => user.id)).toEqual([
      "user_a",
      "user_b",
    ]),
  );
  expect(result.current.suggestions.hasNextPage).toBe(false);
  expect(
    fetchMock.mock.calls.filter(([url]) => String(url).includes("cursor=user_a")),
  ).toHaveLength(2);
});

it("reloads cancelled first pages after a mutation without refetching loaded or foreign lists", async () => {
  const apiUrl = "https://api.example.test";
  const foreignApi = "https://foreign.example.test";
  const target = {
    id: "target",
    name: "Target",
    email: null,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: "" },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [api, user] of [
    [apiUrl, "viewer"],
    [apiUrl, "other-viewer"],
    [foreignApi, "viewer"],
  ]) {
    for (const view of ["followers", "friends", "pending", "sent", "blocked"]) {
      client.setQueryData(["contacts", view, api, user], {
        pages: [{ rows: [], nextCursor: null }],
        pageParams: [""],
      });
    }
    client.setQueryData(["contacts", "suggestions", api, user], {
      pages: [{ users: [], hasContacts: false, nextCursor: null }],
      pageParams: [""],
    });
  }
  const calls = new Map<string, number>();
  let searches = 0;
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get("Authorization");
    if (init?.method === "POST") {
      expect(auth).toBe("Bearer fresh-viewer");
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    }
    if (url.pathname.endsWith("/search")) {
      searches++;
      if (searches === 1) return new Promise<Response>(() => {});
      return Promise.resolve(new Response(JSON.stringify({ users: [target] })));
    }
    expect(url.searchParams.get("type")).toBe("following");
    const key = `${url.origin}:${auth}`;
    const count = (calls.get(key) ?? 0) + 1;
    calls.set(key, count);
    if (count === 1) return new Promise<Response>(() => {});
    return Promise.resolve(
      new Response(
        JSON.stringify({
          rows: [{ fromUserId: "viewer", toUserId: "target", profile: target }],
          nextCursor: null,
        }),
      ),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const getToken = vi.fn(async () => "fresh-viewer");
  const { result, unmount } = renderHook(
    () => ({
      owned: useContacts(apiUrl, "stale", getToken, undefined, "viewer"),
      otherUser: useContacts(apiUrl, "other-viewer", undefined, undefined, "other-viewer"),
      otherApi: useContacts(foreignApi, "foreign", undefined, undefined, "viewer"),
    }),
    { wrapper },
  );
  try {
    await waitFor(() => expect(calls.size).toBe(3));
    act(() => result.current.owned.runSearch("Target"));
    await waitFor(() => expect(searches).toBe(1));
    await act(async () => {
      await result.current.owned.follow.mutateAsync({
        targetUserId: target.id,
        targetUser: target,
      });
    });
    await waitFor(() =>
      expect(result.current.owned.following.data?.map((row) => row.profile?.id)).toEqual([
        "target",
      ]),
    );
    expect(calls.get(`${apiUrl}:Bearer fresh-viewer`)).toBe(2);
    expect(calls.get(`${apiUrl}:Bearer other-viewer`)).toBe(1);
    expect(calls.get(`${foreignApi}:Bearer foreign`)).toBe(1);
    expect(searches).toBe(2);
  } finally {
    unmount();
    client.clear();
  }
});
