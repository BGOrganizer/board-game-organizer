import { contactConnections, useContacts, useRelationshipList } from "@board-game-organizer/shared";
import { dehydrate, hydrate, QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
      client.setQueryData(["contacts", view, api, user, "pages-v1"], {
        pages: [{ rows: [], nextCursor: null }],
        pageParams: [""],
      });
    }
    client.setQueryData(["contacts", "suggestions", api, user, "device", "pages-v2"], {
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

it.each(["friends", "suggestions"])(
  "opens real infinite observers after restoring flat %s without treating it as pages or hiding read errors",
  async (view) => {
    const apiUrl = "https://api.example.test";
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const oldFriendsKey = ["contacts", "friends", apiUrl, "viewer"];
    const oldSuggestionsKey = ["contacts", "suggestions", apiUrl, "viewer", "device"];
    if (view === "friends") client.setQueryData(oldFriendsKey, []);
    else client.setQueryData(oldSuggestionsKey, { users: [], hasContacts: true });
    const restored = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    hydrate(restored, dehydrate(client));
    client.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={restored}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () => useContacts(apiUrl, "token", undefined, undefined, "viewer"),
      { wrapper },
    );
    try {
      await waitFor(() => expect(result.current.friends.isError).toBe(true));
      await waitFor(() => expect(result.current.suggestions.isError).toBe(true));
      expect(result.current.friends.data).toBeUndefined();
      expect(result.current.suggestions.data).toBeUndefined();
      expect(result.current.friends.error?.message).toBe("HTTP 503");
      expect(restored.getQueryData(oldFriendsKey)).toEqual(view === "friends" ? [] : undefined);
      expect(restored.getQueryData(oldSuggestionsKey)).toEqual(
        view === "suggestions" ? { users: [], hasContacts: true } : undefined,
      );
    } finally {
      unmount();
      restored.clear();
    }
  },
);

it("keeps empty inviter pages valid when a newly mirrored invitee becomes a friend, including a cold restore", async () => {
  const apiUrl = "https://api.example.test";
  let joined = false;
  const target = {
    id: "invitee",
    name: "Invitee",
    email: null,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: "" },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return Response.json(
        url.pathname.endsWith("/suggestions")
          ? { users: joined ? [target] : [], hasContacts: true, nextCursor: null }
          : {
              rows:
                joined && url.searchParams.get("type") === "friends"
                  ? [{ fromUserId: "inviter", toUserId: target.id, profile: target }]
                  : [],
              nextCursor: null,
            },
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = (current: QueryClient) =>
    renderHook(() => useContacts(apiUrl, "token", undefined, undefined, "inviter"), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={current}>{children}</QueryClientProvider>
      ),
    });
  const initial = render(client);
  await waitFor(() => expect(initial.result.current.friends.data).toEqual([]));
  await waitFor(() => expect(initial.result.current.suggestions.data?.users).toEqual([]));
  joined = true; // Another client claims the invitation after the Clerk mirror exists.
  await act(async () => {
    await client.invalidateQueries({
      queryKey: ["contacts"],
      predicate: ({ queryKey }) => queryKey[2] === apiUrl && queryKey[3] === "inviter",
    });
  });
  await waitFor(() =>
    expect(initial.result.current.friends.data?.[0]?.profile?.id).toBe("invitee"),
  );
  await waitFor(() =>
    expect(initial.result.current.suggestions.data?.users[0]?.id).toBe("invitee"),
  );
  const saved = dehydrate(client);
  initial.unmount();
  client.clear();
  const restored = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  hydrate(restored, saved);
  const next = render(restored);
  try {
    expect(next.result.current.friends.data?.[0]?.profile?.id).toBe("invitee");
    expect(next.result.current.suggestions.data?.users[0]?.id).toBe("invitee");
    expect(next.result.current.friends.hasNextPage).toBe(false);
    expect(next.result.current.suggestions.hasNextPage).toBe(false);
  } finally {
    next.unmount();
    restored.clear();
  }
});

it.each(["friends", "following", "followers", "pending", "sent", "blocked"] as const)(
  "bounds retained %s before projection, reveals cached rows once, and resets on owner/API/reentry",
  async (type) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, structuralSharing: false } },
    });
    const api = "https://api.example.test";
    const rows = (offset: number) =>
      Array.from({ length: 20 }, (_, i) => ({
        fromUserId: "viewer",
        toUserId: String(offset + i),
        profile: null,
      }));
    const reads = vi.fn();
    const pages = Array.from({ length: 300 }, (_, page) => ({
      get rows() {
        reads(page);
        return rows(page * 20);
      },
      nextCursor: null,
    }));
    const key = (base: string, owner: string) => ["contacts", type, base, owner, "pages-v1"];
    for (const [base, owner] of [
      [api, "viewer"],
      [api, "other"],
      ["https://other.example.test", "other"],
    ] as const)
      client.setQueryData(key(base, owner), {
        pages,
        pageParams: pages.map((_, i) => String(i)),
      });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const render = () =>
      renderHook(
        ({ base, owner }) =>
          useRelationshipList(base, null, undefined, undefined, owner, type, false),
        {
          wrapper,
          initialProps: { base: api, owner: "viewer" },
        },
      );
    const view = render();
    expect(view.result.current.data).toHaveLength(20);
    const metadataReads = type === "pending" || type === "sent" ? 0 : pages.length;
    expect(reads).toHaveBeenCalledTimes(metadataReads + 1);
    const first = view.result.current.data;
    const more = view.result.current.fetchNextPage;
    view.rerender({ base: api, owner: "viewer" });
    expect(view.result.current.data).toBe(first);
    expect(reads).toHaveBeenCalledTimes(metadataReads + 1);
    await act(async () => {
      await Promise.all([more(), more()]);
    });
    expect(view.result.current.data).toHaveLength(40);
    expect(reads).toHaveBeenCalledTimes(metadataReads + 3);
    expect(client.getQueryData<{ pages: unknown[] }>(key(api, "viewer"))?.pages).toBe(pages);
    view.rerender({ base: api, owner: "other" });
    expect(view.result.current.data).toHaveLength(20);
    await act(async () => {
      await more();
    });
    expect(view.result.current.data).toHaveLength(20);
    view.rerender({ base: "https://other.example.test", owner: "other" });
    expect(view.result.current.data).toHaveLength(20);
    view.unmount();
    const remounted = render();
    expect(remounted.result.current.data).toHaveLength(20);
    remounted.unmount();
    client.clear();
  },
);

it("bounds cached suggestions while preserving hasContacts and canonical off-window request actions", async () => {
  const api = "https://api.example.test";
  const user = (id: string) => ({
    id,
    name: id,
    email: null,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: "" },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, structuralSharing: false } },
  });
  const pending = Array.from({ length: 21 }, (_, i) => ({
    fromUserId: "target",
    toUserId: "viewer",
    profile: user(`pending-${i}`),
  }));
  for (const type of ["friends", "following", "followers", "pending", "sent", "blocked"])
    client.setQueryData(["contacts", type, api, "viewer", "pages-v1"], {
      pages:
        type === "pending"
          ? [
              { rows: pending.slice(0, 20), nextCursor: "last" },
              { rows: pending.slice(20), nextCursor: null },
            ]
          : [{ rows: [], nextCursor: null }],
      pageParams: type === "pending" ? ["", "last"] : [""],
    });
  const reads = vi.fn();
  const pages = Array.from({ length: 300 }, (_, page) => ({
    get users() {
      reads(page);
      return Array.from({ length: 20 }, (_, i) => user(`suggestion-${page * 20 + i}`));
    },
    hasContacts: true,
    nextCursor: null,
  }));
  client.setQueryData(["contacts", "suggestions", api, "viewer", "device", "pages-v2"], {
    pages,
    pageParams: pages.map((_, i) => String(i)),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ owner, tab }) => useContacts(api, null, undefined, undefined, owner, undefined, tab),
    { wrapper, initialProps: { owner: "viewer", tab: "connections" } },
  );
  expect(view.result.current.suggestions.data?.users).toHaveLength(20);
  expect(reads).toHaveBeenCalledTimes(1);
  expect(view.result.current.suggestions.data?.hasContacts).toBe(true);
  expect(view.result.current.pending.data).toHaveLength(20);
  expect(view.result.current.friendRequestContext("pending-20")).toBe("incoming");
  const first = view.result.current.suggestions.data;
  view.rerender({ owner: "viewer", tab: "connections" });
  expect(view.result.current.suggestions.data).toBe(first);
  expect(reads).toHaveBeenCalledTimes(1);
  const more = view.result.current.suggestions.fetchNextPage;
  await act(async () => {
    await Promise.all([more(), more()]);
  });
  expect(view.result.current.suggestions.data?.users).toHaveLength(40);
  expect(reads).toHaveBeenCalledTimes(3);
  view.rerender({ owner: "viewer", tab: "requests" });
  expect(view.result.current.suggestions.data?.users).toHaveLength(20);
  expect(view.result.current.friendRequestContext("pending-20")).toBe("incoming");
  await act(async () => {
    await more();
  });
  expect(view.result.current.suggestions.data?.users).toHaveLength(20);
  view.rerender({ owner: "other", tab: "requests" });
  expect(view.result.current.friendRequestContext("pending-20")).toBeUndefined();
  expect(view.result.current.suggestions.data).toBeUndefined();
  await act(async () => {
    await more();
  });
  expect(view.result.current.suggestions.data).toBeUndefined();
  view.unmount();
  client.clear();
});

it("keeps off-window block/connection IDs canonical and stable across subtab changes", () => {
  const api = "https://api.example.test";
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const person = (id: string) => ({
    id,
    name: id,
    email: null,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: "" },
  });
  const row = (id: string) => ({ fromUserId: "viewer", toUserId: id, profile: person(id) });
  const fillers = (type: string) => Array.from({ length: 20 }, (_, i) => row(`${type}-${i}`));
  for (const type of ["friends", "following", "followers", "blocked", "pending", "sent"]) {
    const first = fillers(type);
    if (type === "friends") first[0] = row("blocked-hidden");
    if (type === "following") first[0] = row("friend-hidden");
    if (type === "followers") first[0] = row("following-hidden");
    const target =
      type === "friends"
        ? "friend-hidden"
        : type === "following"
          ? "following-hidden"
          : type === "followers"
            ? "follower-hidden"
            : "blocked-hidden";
    client.setQueryData(["contacts", type, api, "viewer", "pages-v1"], {
      pages: [
        { rows: first, nextCursor: "later" },
        ...Array.from({ length: 298 }, () => ({ rows: [], nextCursor: "later" })),
        { rows: [row(target)], nextCursor: null },
      ],
      pageParams: Array.from({ length: 300 }, (_, i) => String(i)),
    });
  }
  client.setQueryData(["contacts", "suggestions", api, "viewer", "device", "pages-v2"], {
    pages: [
      {
        users: [person("follower-hidden"), person("blocked-hidden"), person("device")],
        hasContacts: true,
        nextCursor: null,
      },
    ],
    pageParams: [""],
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ owner, tab }) => useContacts(api, null, undefined, undefined, owner, undefined, tab),
    { wrapper, initialProps: { owner: "viewer", tab: "connections" } },
  );
  const known = view.result.current.knownConnectionIds;
  const current = view.result.current;
  const groups = contactConnections(
    current.friends.data ?? [],
    current.following.data ?? [],
    current.followers.data ?? [],
    current.suggestions.data?.users ?? [],
    current.blocked.data ?? [],
    known,
  );
  expect(groups.flatMap(({ users }) => users.map(({ id }) => id))).not.toContain("blocked-hidden");
  expect(groups[1].users.some(({ id }) => id === "friend-hidden")).toBe(false);
  expect(groups[2].users.some(({ id }) => id === "following-hidden")).toBe(false);
  expect(groups[4].users.map(({ id }) => id)).toEqual(["device"]);
  view.rerender({ owner: "viewer", tab: "requests" });
  expect(view.result.current.knownConnectionIds).toBe(known);
  expect(known.blocked.has("blocked-hidden")).toBe(true);
  view.rerender({ owner: "other", tab: "requests" });
  for (const ids of Object.values(view.result.current.knownConnectionIds)) expect(ids.size).toBe(0);
  view.unmount();
  client.clear();
});
