import {
  type NotificationChangeRow,
  type NotificationChangesPage,
  type NotificationChangesScope,
  type NotificationDto,
  type NotificationListResponse,
  notificationItemId,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  notificationChangesQuery,
  notificationListKey,
  useNotifications,
} from "@board-game-organizer/shared";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const groupId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-01-02T00:00:00.000Z";
const options = {
  apiUrl: "https://api.example.test",
  userId: "owner",
  getToken: async () => "fresh-token",
  enabled: false,
};
const scope: NotificationChangesScope = { kind: "group", id: groupId, tab: "all" };
const ids = ["000000000000000000000001", "000000000000000000000002"];
const rows: NotificationDto[] = [
  {
    id: ids[0],
    kind: "group_invitation",
    title: "Group invitation",
    description: "The invitation needs your response.",
    href: `/groups/${groupId}`,
    readAt: null,
    requiresResponse: true,
    createdAt: timestamp,
  },
  {
    id: ids[1],
    kind: "group_membership_updated",
    title: "Group membership changed",
    description: "A member joined the group.",
    href: `/groups/${groupId}`,
    readAt: null,
    createdAt: timestamp,
  },
];
const clients: QueryClient[] = [];
const inbox: InfiniteData<NotificationListResponse> = {
  pages: [{ notifications: rows, unreadCount: 2, nextCursor: null }],
  pageParams: [undefined],
};
const changeRows = rows.map(
  ({ id, title, description, requiresResponse }): NotificationChangeRow => {
    const references = {
      notificationId: id,
      itemId: notificationItemId(groupId, "overview", undefined, "group"),
      effectiveAt: timestamp,
    };
    return {
      ...references,
      title,
      description,
      requiresResponse: Boolean(requiresResponse),
      messageCode: "group_info",
      readReference: references,
    };
  },
);
const changes: InfiniteData<NotificationChangesPage> = {
  pages: [
    {
      asOf: timestamp,
      changes: changeRows,
      nextCursor: null,
      tabCounts: { details: 2, members: 0, tables: 0, participants: 0 },
    },
  ],
  pageParams: [undefined],
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const changesKey = notificationChangesQuery(options, scope).queryKey;
  const foreignKey = notificationChangesQuery(
    { ...options, userId: "other-owner" },
    scope,
  ).queryKey;
  client.setQueryData(notificationListKey(options, 5), structuredClone(inbox));
  client.setQueryData(changesKey, structuredClone(changes));
  client.setQueryData(foreignKey, structuredClone(changes));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, changesKey, foreignKey, wrapper };
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it("keeps pending decisions and resource rows untouched by the individual inbox read request", async () => {
  const { client, changesKey, wrapper } = setup();
  const gate = Promise.withResolvers<Response>();
  const fetcher = vi.fn(() => gate.promise);
  vi.stubGlobal("fetch", fetcher);
  const view = renderHook(() => useNotifications(options), { wrapper });
  let action: Promise<void> | undefined;
  act(() => {
    action = view.result.current.markRead.mutateAsync(ids[0]);
  });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(view.result.current.notifications.find(({ id }) => id === ids[0])?.readAt).toBeNull();
  expect(view.result.current.unreadCount).toBe(2);
  expect(client.getQueryData(changesKey)).toEqual(changes);
  await act(async () => {
    gate.resolve(new Response(null, { status: 204 }));
    await action;
  });
  expect(view.result.current.notifications.find(({ id }) => id === ids[0])?.readAt).toBeNull();
  expect(client.getQueryData(changesKey)).toEqual(changes);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    `${options.apiUrl}/api/notifications/${ids[0]}`,
    expect.objectContaining({ method: "PATCH", signal: expect.any(AbortSignal) }),
  );
});

it.each([false, true])(
  "projects inbox deletion into only the same owner's resource pages (whole inbox: %s)",
  async (whole) => {
    const { client, changesKey, foreignKey, wrapper } = setup();
    const gate = Promise.withResolvers<Response>();
    const fetcher = vi.fn(() => gate.promise);
    vi.stubGlobal("fetch", fetcher);
    const view = renderHook(() => useNotifications(options), { wrapper });
    let action: Promise<void> | undefined;
    act(() => {
      action = whole
        ? view.result.current.deleteAllNotifications.mutateAsync()
        : view.result.current.deleteNotification.mutateAsync(ids[1]);
      // Keep the promise observed until the expected rejection settles.
      void action.catch(() => undefined);
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(
      client.getQueryData<InfiniteData<NotificationChangesPage>>(changesKey)?.pages[0].changes,
    ).toEqual(whole ? [] : [changeRows[0]]);
    expect(client.getQueryData(foreignKey)).toEqual(changes);
    await act(async () => {
      gate.resolve(Response.json({ error: "Deletion conflict" }, { status: 409 }));
      await expect(action).rejects.toThrow("HTTP 409");
    });
    expect(client.getQueryData(changesKey)).toEqual(changes);
    expect(client.getQueryData(foreignKey)).toEqual(changes);
    expect(view.result.current.notifications).toEqual(rows);
  },
);

it("exposes an unsuccessful push deregistration without rewriting the inbox", async () => {
  const { wrapper } = setup();
  const fetcher = vi.fn(async () => Response.json({ error: "Unavailable" }, { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const view = renderHook(() => useNotifications(options), { wrapper });
  await act(async () => {
    await expect(view.result.current.removePush.mutateAsync("push-device")).rejects.toThrow(
      "HTTP 503",
    );
  });
  expect(view.result.current.notifications).toEqual(rows);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    `${options.apiUrl}/api/push-subscriptions`,
    expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ token: "push-device" }),
      headers: expect.objectContaining({ Authorization: "Bearer fresh-token" }),
    }),
  );
});

it("returns the bulk-read failure to the caller and restores every unread card", async () => {
  const { wrapper } = setup();
  const fetcher = vi.fn(async () =>
    Response.json({ error: "Invalid read request" }, { status: 400 }),
  );
  const feedback = { onError: vi.fn(), onOptimisticUpdate: vi.fn() };
  vi.stubGlobal("fetch", fetcher);
  const view = renderHook(() => useNotifications({ ...options, feedback }), { wrapper });
  await act(async () => {
    await expect(view.result.current.markAllRead.mutateAsync()).rejects.toThrow("HTTP 400");
  });
  await waitFor(() => expect(view.result.current.unreadCount).toBe(2));
  expect(view.result.current.notifications).toEqual(rows);
  expect(feedback.onOptimisticUpdate).not.toHaveBeenCalled();
  expect(feedback.onError).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    `${options.apiUrl}/api/notifications`,
    expect.objectContaining({ method: "PATCH", signal: expect.any(AbortSignal) }),
  );
});
