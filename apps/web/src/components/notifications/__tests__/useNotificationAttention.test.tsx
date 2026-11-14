import type {
  NotificationAttentionCount,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
  NotificationDto,
  NotificationListResponse,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  notificationAttentionQuery,
  notificationListKey,
  useNotificationAttention,
  useNotifications,
  useReadNotificationAttention,
} from "@board-game-organizer/shared";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const eventId = "11111111-1111-4111-8111-111111111111",
  groupId = "22222222-2222-4222-8222-222222222222",
  tableId = "33333333-3333-4333-8333-333333333333";
const table = { kind: "table", id: tableId } as const,
  event = { kind: "event", id: eventId } as const,
  group = { kind: "group", id: groupId } as const;
const targets: NotificationAttentionTarget[] = [
  table,
  event,
  group,
  { kind: "contact", id: "friend" },
  { kind: "contacts", id: "requests" },
  { kind: "contacts", id: "connections" },
];
const options = {
  apiUrl: "https://api.test",
  userId: "owner",
  getToken: async () => "fresh-token",
};
const asOf = "2027-01-01T00:00:00.000Z";
function row(
  target: NotificationAttentionTarget,
  count: number,
  direct = count,
): NotificationAttentionCount {
  return {
    target,
    count,
    direct,
    events: 0,
    sections: { connections: 0, requests: 0, search: 0 },
    ...(target.kind === "table" || target.kind === "event" ? { eventId, groupId } : {}),
  };
}
function original(): NotificationAttentionSnapshot {
  return {
    asOf,
    unreadCount: 8,
    summary: {
      tables: 2,
      events: 3,
      groups: 4,
      contacts: 4,
      sections: { connections: 2, requests: 2, search: 0 },
    },
    targets: [
      row(table, 2),
      row(event, 3, 1),
      row(group, 4, 1),
      {
        ...row({ kind: "contact", id: "friend" }, 4),
        sections: { connections: 2, requests: 2, search: 0 },
      },
      row({ kind: "contacts", id: "requests" }, 2),
      row({ kind: "contacts", id: "connections" }, 2),
    ],
  };
}
function notification(n: number, target: "table" | "event" | "group"): NotificationDto {
  return {
    id: n.toString(16).padStart(24, "0"),
    kind:
      target === "table"
        ? "event_booking_removed"
        : target === "event"
          ? "event_confirmed"
          : "group_membership_updated",
    title: "Fixture",
    description: "Fixture",
    href:
      target === "table"
        ? `/events/${eventId}/tables/${tableId}`
        : target === "event"
          ? `/events/${eventId}`
          : `/groups/${groupId}`,
    createdAt: "2026-12-31T23:59:59Z",
    readAt: null,
    attention: {
      target: target === "table" ? table : target === "event" ? event : group,
      ...(target !== "group" ? { eventId, groupId } : { groupId }),
    },
  };
}
const notifications = [
  notification(1, "table"),
  notification(2, "table"),
  notification(3, "event"),
  notification(4, "group"),
];
const clients: QueryClient[] = [];
function setup(owner = options) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const data: InfiniteData<NotificationListResponse> = {
    pages: [{ notifications, unreadCount: 8, nextCursor: null, attention: original().summary }],
    pageParams: [undefined],
  };
  client.setQueryData(notificationAttentionQuery(owner, targets).queryKey, original());
  for (const locale of ["en", "it"] as const)
    for (const limit of [3, 20])
      client.setQueryData(notificationListKey({ ...owner, locale }, limit), structuredClone(data));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});
function useObservedAttention(owner = options) {
  return {
    counts: useNotificationAttention(owner, targets),
    read: useReadNotificationAttention(owner),
    inbox: useNotifications({ ...owner, enabled: false, locale: "en" }, 20),
  };
}

it("projects Table reads to their own container and bell before HTTP, never Event/Group ancestry or later arrivals", async () => {
  const { client, wrapper } = setup();
  const foreign = { ...options, userId: "other" };
  client.setQueryData(notificationAttentionQuery(foreign, targets).queryKey, original());
  let release!: (response: Response) => void;
  let server = original();
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "PATCH"
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json(server),
  );
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useObservedAttention(), { wrapper });
  await waitFor(() => expect(hook.result.current.counts.get(table)?.count).toBe(2));
  act(() => hook.result.current.read.read(table));
  await waitFor(() => expect(release).toBeTypeOf("function"));
  expect(hook.result.current.counts.get(table)?.count).toBe(0);
  expect(hook.result.current.counts.get(event)?.count).toBe(3);
  expect(hook.result.current.counts.get(group)?.count).toBe(4);
  expect(hook.result.current.inbox.unreadCount).toBe(6);
  expect(hook.result.current.inbox.attention).toEqual({
    ...original().summary,
    tables: 0,
  });
  expect(
    hook.result.current.inbox.notifications
      .filter((value) => value.readAt)
      .map((value) => value.id),
  ).toEqual(notifications.slice(0, 2).map((value) => value.id));
  expect(client.getQueryData(notificationAttentionQuery(foreign, targets).queryKey)).toEqual(
    original(),
  );
  const pending = original();
  pending.asOf = "2027-01-01T00:00:01.000Z";
  pending.unreadCount++;
  pending.summary = { ...pending.summary, tables: 3 };
  pending.targets[0].count++;
  pending.targets[0].direct++;
  server = structuredClone(pending);
  await act(async () => {
    await client.fetchQuery({ ...notificationAttentionQuery(options, targets), staleTime: 0 });
  });
  await waitFor(() => expect(hook.result.current.counts.get(table)?.count).toBe(1));
  server.unreadCount -= 2;
  server.summary = { ...server.summary, tables: 1 };
  server.targets[0].count -= 2;
  server.targets[0].direct -= 2;
  await act(async () => release(Response.json({ updated: 2, snapshot: server })));
  await waitFor(() => expect(hook.result.current.inbox.busy).toBe(false));
  expect(hook.result.current.counts.get(table)?.count).toBe(1);
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  expect(
    JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)),
  ).toEqual({ target: table, through: asOf });
});
it("keeps direct Group reads independent from Table reads and rolls back only rejected intent", async () => {
  const { wrapper } = setup();
  const releases = new Map<string, (response: Response) => void>();
  let server = original();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH")
        return new Promise<Response>((resolve) =>
          releases.set(JSON.parse(String(init.body)).target.kind, resolve),
        );
      return Response.json(server);
    }),
  );
  const hook = renderHook(() => useObservedAttention(), { wrapper });
  act(() => {
    hook.result.current.read.read(table);
    hook.result.current.read.read(group);
  });
  await waitFor(() => expect(releases.size).toBe(2));
  expect(hook.result.current.inbox.unreadCount).toBe(5);
  expect(hook.result.current.counts.get(group)?.count).toBe(3);
  await act(async () =>
    releases.get("table")?.(Response.json({ error: "Denied" }, { status: 409 })),
  );
  await waitFor(() => expect(hook.result.current.counts.get(table)?.count).toBe(2));
  expect(hook.result.current.counts.get(group)?.count).toBe(3);
  expect(hook.result.current.inbox.unreadCount).toBe(7);
  server = original();
  server.unreadCount = 7;
  server.summary.groups = 3;
  server.targets[2].count = 3;
  server.targets[2].direct = 0;
  await act(async () => releases.get("group")?.(Response.json({ updated: 1, snapshot: server })));
  await waitFor(() => expect(hook.result.current.inbox.busy).toBe(false));
  expect(hook.result.current.counts.get(table)?.count).toBe(2);
  expect(hook.result.current.counts.get(group)?.events).toBe(0);
});
it("reads only selected Contact section and keeps each person's other section unread", async () => {
  const { wrapper } = setup();
  let release!: (response: Response) => void;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === "PATCH"
      ? new Promise<Response>((done) => {
          release = done;
        })
      : Response.json(original()),
  );
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useObservedAttention(), { wrapper });
  act(() => hook.result.current.read.read({ kind: "contacts", id: "requests" }));
  await waitFor(() => expect(release).toBeTypeOf("function"));
  expect(hook.result.current.inbox.attention?.sections).toEqual({
    requests: 0,
    connections: 2,
    search: 0,
  });
  expect(hook.result.current.counts.get({ kind: "contact", id: "friend" })?.count).toBe(2);
  expect(hook.result.current.counts.get(group)?.count).toBe(4);
  await act(async () => release(Response.json({ error: "Denied" }, { status: 409 })));
  await waitFor(() =>
    expect(hook.result.current.counts.get({ kind: "contact", id: "friend" })?.count).toBe(4),
  );
  expect(hook.result.current.inbox.attention?.sections.requests).toBe(2);
});
it.each([true, false])(
  "verifies lost read responses from source without reposting (saved=%s)",
  async (saved) => {
    const { client, wrapper } = setup();
    let failed = false;
    const observedKey = notificationListKey({ ...options, locale: "en" }, 20);
    client.removeQueries({
      predicate: (query) =>
        query.queryKey[0] === "notifications" &&
        JSON.stringify(query.queryKey) !== JSON.stringify(observedKey),
    });
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        failed = true;
        throw new TypeError("Connection lost");
      }
      const source = original();
      if (failed && saved) {
        source.unreadCount = 6;
        source.summary = { ...source.summary, tables: 0, events: 1, groups: 2 };
        source.targets[0].count = source.targets[0].direct = 0;
        source.targets[1].count = 1;
        source.targets[2].count = 2;
      }
      if (url.includes("/attention")) return Response.json(source);
      return Response.json({
        notifications: notifications.map((value) =>
          failed && saved && value.attention?.target.kind === "table"
            ? { ...value, readAt: asOf }
            : value,
        ),
        unreadCount: source.unreadCount,
        nextCursor: null,
        attention: source.summary,
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const hook = renderHook(() => useObservedAttention(), { wrapper });
    act(() => hook.result.current.read.read(table));
    await waitFor(() => expect(failed).toBe(true));
    await waitFor(() => expect(hook.result.current.inbox.busy).toBe(false));
    expect(hook.result.current.counts.get(table)?.count).toBe(saved ? 0 : 2);
    expect(hook.result.current.inbox.unreadCount).toBe(saved ? 6 : 8);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  },
);
it("keeps unclassified deletions out of unrelated badges and clears every hierarchy only for a real bulk intent", async () => {
  const { client, wrapper } = setup();
  const excluded: NotificationDto = { ...notification(9, "event"), attention: null };
  const source = { ...original(), unreadCount: 9 };
  client.setQueryData(notificationAttentionQuery(options, targets).queryKey, source);
  for (const [key, value] of client.getQueriesData<InfiniteData<NotificationListResponse>>({
    queryKey: ["notifications", options.apiUrl, options.userId],
  })) {
    if (value)
      client.setQueryData(key, {
        ...value,
        pages: value.pages.map((page) => ({
          ...page,
          unreadCount: 9,
          notifications: [...page.notifications, excluded],
        })),
      });
  }
  let release!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Promise<Response>((done) => {
            release = done;
          })
        : Response.json(source),
    ),
  );
  const hook = renderHook(() => useObservedAttention(), { wrapper });
  act(() => hook.result.current.inbox.deleteNotification.mutate(excluded.id));
  await waitFor(() => expect(hook.result.current.inbox.unreadCount).toBe(8));
  expect(hook.result.current.counts.get(event)?.count).toBe(3);
  expect(hook.result.current.inbox.attention).toEqual(original().summary);
  await act(async () => release(Response.json({ error: "Denied" }, { status: 409 })));
  await waitFor(() => expect(hook.result.current.inbox.busy).toBe(false));
  expect(hook.result.current.inbox.unreadCount).toBe(9);
  act(() => hook.result.current.inbox.deleteAllNotifications.mutate());
  await waitFor(() => expect(hook.result.current.inbox.unreadCount).toBe(0));
  expect(hook.result.current.counts.get(table)?.count).toBe(0);
  expect(hook.result.current.counts.get(group)?.count).toBe(0);
  await act(async () => release(Response.json({ error: "Denied" }, { status: 409 })));
  await waitFor(() => expect(hook.result.current.inbox.busy).toBe(false));
  expect(hook.result.current.counts.get(group)?.count).toBe(4);
});
it("guards same-actor replacement sessions while token resolution is held", async () => {
  let token!: (value: string) => void;
  const owner = {
    ...options,
    getToken: () =>
      new Promise<string>((resolve) => {
        token = resolve;
      }),
  };
  const { client, wrapper } = setup(owner),
    fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(
    () => ({
      read: useReadNotificationAttention(owner),
      inbox: useNotifications({ ...owner, enabled: false, locale: "en" }, 20),
    }),
    { wrapper },
  );
  act(() => hook.result.current.read.read(table));
  await waitFor(() => expect(token).toBeTypeOf("function"));
  act(() => {
    clearSessionQueryCache(client);
    client.setQueryData(notificationAttentionQuery(options, targets).queryKey, {
      ...original(),
      unreadCount: 40,
    });
  });
  await act(async () => token("new-session-token"));
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    client.getQueryData<NotificationAttentionSnapshot>(
      notificationAttentionQuery(options, targets).queryKey,
    )?.unreadCount,
  ).toBe(40);
});
it("rejects missing, duplicate or foreign target snapshots instead of accepting fabricated empty counters", async () => {
  const { client } = setup();
  for (const rows of [[], [row(table, 1)], [row(group, 1), row(group, 1)]]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ...original(), targets: rows })),
    );
    await expect(
      client.fetchQuery({ ...notificationAttentionQuery(options, [group]), staleTime: 0 }),
    ).rejects.toMatchObject({ status: 502, code: "INVALID_NOTIFICATION_ATTENTION" });
  }
});
it("batches visible IDs, deduplicates reorderings, isolates actors and exposes read errors rather than inventing zero counts", async () => {
  const { wrapper } = setup();
  const many = Array.from({ length: 131 }, (_, index) => ({
    kind: "table" as const,
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, "0")}`,
  }));
  const fetcher = vi.fn(async (url: string) => {
    const requested = JSON.parse(
      new URL(url).searchParams.get("targets") ?? "[]",
    ) as NotificationAttentionTarget[];
    return Response.json({ ...original(), targets: requested.map((value) => row(value, 1)) });
  });
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(
    ({ ids, userId }) => useNotificationAttention({ ...options, userId }, ids),
    { wrapper, initialProps: { ids: [...many, many[0]], userId: options.userId } },
  );
  await waitFor(() => expect(hook.result.current.get(many[130])?.count).toBe(1));
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(
    fetcher.mock.calls.map(
      ([url]) => JSON.parse(new URL(url).searchParams.get("targets") ?? "[]").length,
    ),
  ).toEqual([50, 50, 31]);
  hook.rerender({ ids: [...many].reverse(), userId: options.userId });
  expect(fetcher).toHaveBeenCalledTimes(3);
  fetcher.mockImplementation(async () => Response.json({ error: "Offline" }, { status: 503 }));
  hook.rerender({ ids: many, userId: "other" });
  await waitFor(() => expect(hook.result.current.error).toBeTruthy());
  expect(hook.result.current.get(many[0])).toBeUndefined();
});
