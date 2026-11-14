import type { NotificationDto } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventRecordKeys,
  notificationListKey,
  useNotifications,
  useRecordTable,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventId, plannedTable, seat, tableId } from "@/test-fixtures/eventRecords";

function wrapper(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const options = {
  apiUrl: "https://api.example.com",
  getToken: vi.fn(async () => "fresh-token" as string | null),
  userId: "user_1",
  enabled: true,
  protectionBypass: "bypass",
};

const item = (id: string) => ({
  id,
  kind: "friend_request" as const,
  title: "New friend request",
  description: "Alex sent you a friend request.",
  href: "/contacts",
  readAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    options.getToken.mockResolvedValue("fresh-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method && init.method !== "GET") return new Response("{}", { status: 200 });
        const second = url.includes("cursor=cursor-1");
        return new Response(
          JSON.stringify({
            notifications: [item(second ? "second" : "first")],
            unreadCount: 2,
            nextCursor: second ? null : "cursor-1",
          }),
          { status: 200 },
        );
      }),
    );
  });

  it.each([false, true])(
    "refreshes an open Table on a remote invitation, including an initially empty inbox (%s)",
    async (hadNotifications) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const inactive = [...eventRecordKeys.root(options), "detail", "inactive"];
      const foreign = eventRecordKeys.table({ ...options, userId: "foreign" }, eventId, tableId);
      const otherApi = eventRecordKeys.table(
        { ...options, apiUrl: "https://other.test" },
        eventId,
        tableId,
      );
      const readInactive = vi.fn(async () => ({ name: "Not open" }));
      await client.fetchQuery({ queryKey: inactive, queryFn: readInactive });
      for (const key of [eventRecordKeys.table(options, eventId, tableId), foreign, otherApi])
        client.setQueryData(key, plannedTable);
      let notifications: NotificationDto[] = hadNotifications
        ? [item("000000000000000000000001")]
        : [];
      const invitation = { ...seat(options.userId), status: "PENDING" as const };
      const fetch = vi.fn(async (url: RequestInfo | URL) =>
        String(url).includes("/api/notifications?")
          ? Response.json({ notifications, unreadCount: notifications.length, nextCursor: null })
          : Response.json({ ...plannedTable, myRegistration: invitation, canRespond: true }),
      );
      vi.stubGlobal("fetch", fetch);
      const hook = renderHook(
        () => ({
          inbox: useNotifications(options),
          table: useRecordTable(options, eventId, tableId),
        }),
        { wrapper: wrapper(client) },
      );
      await waitFor(() => expect(hook.result.current.inbox.list.isSuccess).toBe(true));
      notifications = [
        { ...item("000000000000000000000002"), kind: "table_invitation" },
        ...notifications,
      ];
      await act(() => hook.result.current.inbox.list.refetch());
      await waitFor(() =>
        expect(hook.result.current.table.data?.myRegistration).toEqual(invitation),
      );
      expect(hook.result.current.table.data?.canRespond).toBe(true);
      expect(readInactive).toHaveBeenCalledOnce();
      expect(client.getQueryState(inactive)?.isInvalidated).toBe(true);
      expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
      expect(client.getQueryState(otherApi)?.isInvalidated).toBe(false);
      expect(fetch.mock.calls.filter(([url]) => String(url).includes("/tables/"))).toHaveLength(1);
      hook.unmount();
      client.clear();
    },
  );
  it.each([false, true])(
    "reconciles all new notification kinds, with conservative active-only refresh across a missed page (%s)",
    async (gap) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      let notifications: NotificationDto[] = [item("000000000000000000000001")];
      let nextCursor: string | null = null;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ notifications, unreadCount: 2, nextCursor })),
      );
      const eventRead = vi.fn(async () => "Updated Table");
      const contactRead = vi.fn(async () => "Updated Contacts");
      const foreignRead = vi.fn(async () => "Foreign Contacts");
      const hook = renderHook(
        () => ({
          inbox: useNotifications(options, 2),
          event: useQuery({
            queryKey: eventRecordKeys.table(options, eventId, tableId),
            queryFn: eventRead,
            initialData: "Cached Table",
            staleTime: Infinity,
          }),
          contacts: useQuery({
            queryKey: ["contacts", "pending", options.apiUrl, options.userId],
            queryFn: contactRead,
            initialData: "Cached Contacts",
            staleTime: Infinity,
          }),
          foreign: useQuery({
            queryKey: ["contacts", "pending", options.apiUrl, "foreign"],
            queryFn: foreignRead,
            initialData: "Foreign Contacts",
            staleTime: Infinity,
          }),
        }),
        { wrapper: wrapper(client) },
      );
      await waitFor(() => expect(hook.result.current.inbox.list.isSuccess).toBe(true));
      notifications = [
        item("000000000000000000000004"),
        {
          ...item("000000000000000000000003"),
          kind: gap ? "friend_request" : "event_booking_confirmed",
        },
      ];
      nextCursor = gap ? "older" : null;
      await act(() => hook.result.current.inbox.list.refetch());
      await waitFor(() => expect(hook.result.current.event.data).toBe("Updated Table"));
      await waitFor(() => expect(hook.result.current.contacts.data).toBe("Updated Contacts"));
      expect(eventRead).toHaveBeenCalledOnce();
      expect(contactRead).toHaveBeenCalledOnce();
      expect(foreignRead).not.toHaveBeenCalled();
      hook.unmount();
      client.clear();
    },
  );
  it.each(["apiUrl", "userId"] as const)(
    "starts a new notification baseline after %s changes and honors createdAt before ID order",
    async (field) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      let notifications = [item("000000000000000000000002")];
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ notifications, unreadCount: 1, nextCursor: null })),
      );
      const hook = renderHook((owner) => useNotifications(owner), {
        wrapper: wrapper(client),
        initialProps: options,
      });
      await waitFor(() => expect(hook.result.current.list.isSuccess).toBe(true));
      const next =
        field === "apiUrl"
          ? { ...options, apiUrl: "https://next.test" }
          : { ...options, userId: "next-user" };
      const oldGroup = ["groups", options.apiUrl, options.userId, "detail", "group"];
      const currentGroup = ["groups", next.apiUrl, next.userId, "detail", "group"];
      for (const key of [oldGroup, currentGroup]) client.setQueryData(key, "Cached Group");
      notifications = [item("000000000000000000000003")];
      hook.rerender(next);
      await waitFor(() =>
        expect(hook.result.current.notifications[0]?.id).toBe(notifications[0].id),
      );
      expect(client.getQueryState(currentGroup)?.isInvalidated).toBe(false);
      notifications = [
        { ...item("000000000000000000000001"), createdAt: "2027-01-01T00:00:00.000Z" },
      ];
      await act(() => hook.result.current.list.refetch());
      await waitFor(() => expect(client.getQueryState(currentGroup)?.isInvalidated).toBe(true));
      expect(client.getQueryState(oldGroup)?.isInvalidated).toBe(false);
      hook.unmount();
      client.clear();
    },
  );
  it("does not mistake local removal, read changes or older rows for a remote update", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let notifications = [item("000000000000000000000002"), item("000000000000000000000001")];
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === "DELETE") {
        notifications = notifications.slice(1);
        return Response.json({});
      }
      return Response.json({ notifications, unreadCount: notifications.length, nextCursor: null });
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const hook = renderHook(() => useNotifications(options), { wrapper: wrapper(client) });
    await waitFor(() => expect(hook.result.current.notifications).toHaveLength(2));
    await act(() => hook.result.current.deleteNotification.mutateAsync("000000000000000000000002"));
    await waitFor(() => expect(hook.result.current.notifications).toHaveLength(1));
    await act(() => hook.result.current.markRead.mutateAsync("000000000000000000000001"));
    expect(
      invalidate.mock.calls.filter(([filters]) =>
        ["contacts", "groups", "events"].includes(String(filters?.queryKey?.[0])),
      ),
    ).toHaveLength(0);
    hook.unmount();
    client.clear();
  });
  it("marks only owning group and event caches stale when remote membership changes", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const current = ["groups", options.apiUrl, options.userId, "detail", "group"];
    const foreign = ["groups", options.apiUrl, "other", "detail", "group"];
    const events = ["events", options.apiUrl, options.userId, "mine"];
    for (const key of [current, foreign, events]) client.setQueryData(key, { name: "Cached" });
    const { result } = renderHook(() => useNotifications(options), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              notifications: [{ ...item("new-community"), kind: "group_membership_updated" }],
              unreadCount: 1,
              nextCursor: null,
            }),
          ),
      ),
    );
    await act(() => result.current.list.refetch());
    await waitFor(() => expect(client.getQueryState(current)?.isInvalidated).toBe(true));
    expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
    expect(client.getQueryState(events)?.isInvalidated).toBe(true);
  });

  it("loads and paginates notifications with fresh auth and preview bypass", async () => {
    const { result } = renderHook(() => useNotifications(options, 1), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/notifications?limit=1&x-vercel-protection-bypass=bypass",
      { headers: { Authorization: "Bearer fresh-token" }, signal: expect.any(AbortSignal) },
    );
    await act(() => result.current.list.fetchNextPage());
    await waitFor(() =>
      expect(result.current.notifications.map(({ id }) => id)).toEqual(["first", "second"]),
    );
    expect(result.current.unreadCount).toBe(2);
    expect(result.current.hasMore).toBe(false);
  });

  it("keeps locale-specific inbox pages separate and reuses each locale's owned cache", async () => {
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify({
            notifications: [
              {
                ...item("same-id"),
                title: String(url).includes("locale=it")
                  ? "Nuova richiesta di amicizia"
                  : "New friend request",
              },
            ],
            unreadCount: 1,
            nextCursor: null,
          }),
        ),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const hook = renderHook(({ locale }) => useNotifications({ ...options, locale }, 3), {
      wrapper: wrapper(client),
      initialProps: { locale: "en" as "en" | "it" },
    });
    await waitFor(() =>
      expect(hook.result.current.notifications[0]?.title).toBe("New friend request"),
    );
    options.getToken.mockResolvedValue("rotated");
    hook.rerender({ locale: "it" });
    await waitFor(() =>
      expect(hook.result.current.notifications[0]?.title).toBe("Nuova richiesta di amicizia"),
    );
    expect(
      client.getQueryData(["notifications", options.apiUrl, options.userId, 3, "en"]),
    ).toMatchObject({ pages: [{ notifications: [{ title: "New friend request" }] }] });
    expect(vi.mocked(fetch).mock.calls.at(-1)).toEqual([
      "https://api.example.com/api/notifications?limit=3&locale=it&x-vercel-protection-bypass=bypass",
      { headers: { Authorization: "Bearer rotated" }, signal: expect.any(AbortSignal) },
    ]);
  });

  it("marks notifications read and registers or removes push tokens", async () => {
    const { result } = renderHook(() => useNotifications(options), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() => result.current.markRead.mutateAsync("notification/id"));
    await act(() => result.current.markAllRead.mutateAsync());
    await act(() =>
      result.current.registerPush.mutateAsync({
        token: "token-1234567890123456",
        platform: "web",
        locale: "en",
      }),
    );
    await act(() => result.current.removePush.mutateAsync("token-1234567890123456"));

    const calls = vi.mocked(fetch).mock.calls;
    expect(
      calls.some(
        ([url, init]) => String(url).includes("notification%2Fid") && init?.method === "PATCH",
      ),
    ).toBe(true);
    expect(
      calls.some(
        ([url, init]) =>
          String(url).endsWith("/api/notifications?x-vercel-protection-bypass=bypass") &&
          init?.method === "PATCH",
      ),
    ).toBe(true);
    expect(
      calls.some(
        ([url, init]) => String(url).includes("push-subscriptions") && init?.method === "POST",
      ),
    ).toBe(true);
    expect(
      calls.some(
        ([url, init]) => String(url).includes("push-subscriptions") && init?.method === "DELETE",
      ),
    ).toBe(true);
    expect(options.getToken.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("marks cached social data stale when a new notification arrives without polling it", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const friendsKey = ["contacts", "friends", options.apiUrl, options.userId];
    client.setQueryData(friendsKey, {
      pages: [{ rows: [], nextCursor: null }],
      pageParams: [""],
    });
    const { result } = renderHook(() => useNotifications(options), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const key = ["notifications", options.apiUrl, options.userId, 5, undefined];
    const previous = client.getQueryData<{
      pages: Array<{ notifications: ReturnType<typeof item>[] }>;
    }>(key);
    expect(previous).toBeDefined();
    act(() => {
      client.setQueryData(key, {
        ...previous,
        pages: previous?.pages.map((page, index) =>
          index === 0 ? { ...page, notifications: [item("new"), ...page.notifications] } : page,
        ),
      });
    });
    await waitFor(() => expect(client.getQueryState(friendsKey)?.isInvalidated).toBe(true));
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => !init?.method)).toHaveLength(1);
  });

  it("rolls notification state back after mutation failures", async () => {
    let failPatch = () => {};
    vi.mocked(fetch).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          failPatch = () => resolve(new Response("{}", { status: 500 }));
        });
      }
      return new Response(
        JSON.stringify({ notifications: [item("first")], unreadCount: 1, nextCursor: null }),
        { status: 200 },
      );
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useNotifications(options), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() => result.current.markRead.mutate("first"));
    await waitFor(() => expect(result.current.notifications[0]?.readAt).not.toBeNull());
    expect(result.current.unreadCount).toBe(0);

    failPatch();
    await waitFor(() => expect(result.current.markRead.isError).toBe(true));
    expect(result.current.notifications[0]?.readAt).toBeNull();
    expect(result.current.unreadCount).toBe(1);
  });

  it("optimistically deletes across inbox caches and restores failed deletes", async () => {
    const deletionId = "0123456789abcdef01234567";
    let failDelete = () => {};
    vi.mocked(fetch).mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return new Promise<Response>((resolve) => {
          failDelete = () => resolve(new Response("{}", { status: 500 }));
        });
      }
      return new Response(
        JSON.stringify({ notifications: [item(deletionId)], unreadCount: 1, nextCursor: null }),
        { status: 200 },
      );
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    const inbox = renderHook(() => useNotifications({ ...options, feedback }, 20), {
      wrapper: wrapper(client),
    });
    const bell = renderHook(() => useNotifications(options, 3), { wrapper: wrapper(client) });
    await waitFor(() => expect(bell.result.current.notifications).toHaveLength(1));
    await waitFor(() => expect(inbox.result.current.notifications).toHaveLength(1));

    act(() => inbox.result.current.deleteNotification.mutate(deletionId));
    await waitFor(() => expect(inbox.result.current.notifications).toHaveLength(0));
    expect(bell.result.current.notifications).toHaveLength(0);
    expect(bell.result.current.unreadCount).toBe(0);
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("delete_notification");
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `https://api.example.com/api/notifications/${deletionId}?x-vercel-protection-bypass=bypass`,
        {
          method: "DELETE",
          headers: { Authorization: "Bearer fresh-token" },
          signal: expect.any(AbortSignal),
        },
      ),
    );

    failDelete();
    await waitFor(() => expect(inbox.result.current.deleteNotification.isError).toBe(true));
    expect(inbox.result.current.notifications).toHaveLength(1);
    expect(bell.result.current.notifications).toHaveLength(1);
    expect(bell.result.current.unreadCount).toBe(1);
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "verify_saved_changes");
  });

  it("dispatches independent notification deletes while responses are held and rolls back only the rejected row", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const ids = [
      "000000000000000000000003",
      "000000000000000000000002",
      "000000000000000000000001",
    ];
    let rows = ids.map(item);
    const writes: Array<{ id: string; resolve: (response: Response) => void }> = [];
    const feedback = { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE")
          return new Promise<Response>((resolve) =>
            writes.push({ id: String(url).split("?")[0].split("/").at(-1) ?? "", resolve }),
          );
        return Response.json({ notifications: rows, unreadCount: rows.length, nextCursor: null });
      }),
    );
    const hook = renderHook(() => useNotifications({ ...options, feedback }), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(hook.result.current.notifications).toHaveLength(3));
    act(() => {
      hook.result.current.deleteNotification.mutate(ids[0]);
      hook.result.current.deleteNotification.mutate(ids[1]);
    });
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(hook.result.current.notifications.map((row) => row.id)).toEqual([ids[2]]);
    expect(hook.result.current.unreadCount).toBe(1);
    expect(hook.result.current.isBusy(ids[2])).toBe(false);
    expect(hook.result.current.busy).toBe(true);
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledTimes(2);
    const first = writes.find((write) => write.id === ids[0]),
      second = writes.find((write) => write.id === ids[1]);
    if (!first || !second) throw new Error("Missing independent deletion");
    rows = rows.filter((row) => row.id !== ids[0]);
    await act(async () => first.resolve(Response.json({})));
    await waitFor(() => expect(hook.result.current.isBusy(ids[0])).toBe(false));
    expect(hook.result.current.notifications.map((row) => row.id)).toEqual([ids[2]]);
    await act(async () => second.resolve(Response.json({ error: "REJECTED" }, { status: 409 })));
    await waitFor(() =>
      expect(hook.result.current.notifications.map((row) => row.id)).toEqual([ids[1], ids[2]]),
    );
    expect(hook.result.current.unreadCount).toBe(2);
    expect(feedback.onSuccess).not.toHaveBeenCalled();
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "delete_notification");
    hook.unmount();
    clearSessionQueryCache(client);
  });
  it("never sends an old notification write or invalidates the new actor after token resolution crosses an API/session switch", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let token: ((value: string) => void) | undefined;
    const getToken = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          token = resolve;
        }),
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const first = { ...options, enabled: false, getToken },
      next = { ...options, apiUrl: "https://other.test", userId: "other", enabled: false };
    const hook = renderHook(({ settings }) => useNotifications(settings), {
      wrapper: wrapper(client),
      initialProps: { settings: first as typeof options },
    });
    act(() => hook.result.current.deleteNotification.mutate("000000000000000000000001"));
    await waitFor(() => expect(token).toBeDefined());
    clearSessionQueryCache(client);
    client.setQueryData(notificationListKey(next, 5), {
      pages: [{ notifications: [], unreadCount: 0, nextCursor: null }],
      pageParams: [undefined],
    });
    hook.rerender({ settings: next });
    const finish = token;
    if (!finish) throw new Error("Missing held token");
    await act(async () => finish("old-token"));
    await waitFor(() => expect(hook.result.current.deleteNotification.isPending).toBe(false));
    expect(fetcher).not.toHaveBeenCalled();
    expect(client.getQueryState(notificationListKey(next, 5))?.isInvalidated).toBe(false);
    hook.unmount();
    clearSessionQueryCache(client);
  });
  it("exposes HTTP and missing-auth failures without fetching while disabled", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 500 }));
    const failed = renderHook(() => useNotifications(options), { wrapper: wrapper() });
    await waitFor(() => expect(failed.result.current.list.isError).toBe(true));

    options.getToken.mockResolvedValue(null);
    const unauthenticated = renderHook(() => useNotifications({ ...options, userId: "user_2" }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(unauthenticated.result.current.list.isError).toBe(true));

    vi.mocked(fetch).mockClear();
    renderHook(() => useNotifications({ ...options, enabled: false, userId: null }), {
      wrapper: wrapper(),
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
