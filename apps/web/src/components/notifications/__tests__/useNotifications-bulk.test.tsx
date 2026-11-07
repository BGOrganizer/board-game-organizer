import type { NotificationListResponse } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  notificationListKey,
  notificationsPageQuery,
  useNotifications,
} from "@board-game-organizer/shared";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

const options = {
  apiUrl: "https://api.example.test",
  userId: "actor",
  getToken: async () => "rotated-token",
  enabled: true,
  locale: "en" as const,
  protectionBypass: "preview",
};
const item = (id: string) => ({
  id: id.padStart(24, "0"),
  kind: "friend_request" as const,
  title: "New request",
  description: "Request received",
  href: "/contacts",
  readAt: null,
  createdAt: "2030-01-01T00:00:00.000Z",
});
const original: InfiniteData<NotificationListResponse> = {
  pages: [
    { notifications: [item("3"), item("2")], unreadCount: 7, nextCursor: "older" },
    { notifications: [item("1")], unreadCount: 7, nextCursor: "unloaded" },
  ],
  pageParams: [undefined, "older"],
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

it.each(["success", "rejected", "lost-response-saved", "lost-response-rejected", "offline"])(
  "clears all owned pages, locales and bell before HTTP settles; reconciles %s without another DELETE",
  async (outcome) => {
    const { client, wrapper } = setup();
    const english = notificationListKey(options, 20);
    const italian = notificationListKey({ ...options, locale: "it" }, 20);
    const bellKey = notificationListKey(options, 3);
    const foreign = notificationListKey({ ...options, userId: "foreign" }, 20);
    const otherApi = notificationListKey({ ...options, apiUrl: "https://other.test" }, 20);
    for (const key of [english, italian, bellKey, foreign, otherApi])
      client.setQueryData(key, original);
    let pages = original.pages;
    let finish: ((response: Response) => void) | undefined;
    let fail: ((error: Error) => void) | undefined;
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE")
        return new Promise<Response>((resolve, reject) => {
          finish = resolve;
          fail = reject;
        });
      return Response.json(pages[new URL(String(url)).searchParams.has("cursor") ? 1 : 0]);
    });
    vi.stubGlobal("fetch", fetcher);
    // An inactive, previously materialized locale still owns its canonical query function.
    await client.prefetchInfiniteQuery({
      ...notificationsPageQuery({ ...options, locale: "it" }, 20),
      staleTime: 0,
    });
    fetcher.mockClear();
    const feedback = { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
    const hook = renderHook(
      () => ({
        inbox: useNotifications({ ...options, feedback }, 20),
        bell: useNotifications(options, 3),
      }),
      { wrapper },
    );
    expect(hook.result.current.inbox.notifications).toHaveLength(3);
    act(() => hook.result.current.inbox.deleteAllNotifications.mutate());
    await waitFor(() => expect(finish).toBeDefined());
    expect(hook.result.current.inbox.notifications).toEqual([]);
    expect(hook.result.current.inbox.hasMore).toBe(false);
    expect(hook.result.current.inbox.busy).toBe(true);
    expect(hook.result.current.inbox.isBusy("unloaded")).toBe(true);
    expect(hook.result.current.bell.notifications).toEqual([]);
    expect(hook.result.current.bell.unreadCount).toBe(0);
    expect(client.getQueryData(italian)).toMatchObject({
      pages: [
        { notifications: [], unreadCount: 0, nextCursor: null },
        { notifications: [], unreadCount: 0, nextCursor: null },
      ],
    });
    expect(client.getQueryData(foreign)).toBe(original);
    expect(client.getQueryData(otherApi)).toBe(original);
    expect(feedback.onOptimisticUpdate).toHaveBeenCalledExactlyOnceWith("delete_all_notifications");
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.test/api/notifications?x-vercel-protection-bypass=preview",
      {
        method: "DELETE",
        headers: { Authorization: "Bearer rotated-token" },
        signal: expect.any(AbortSignal),
      },
    );

    const saved = outcome === "success" || outcome === "lost-response-saved";
    // An arrival after deletion belongs in the next authoritative read, not in its overlay.
    if (saved) pages = [{ notifications: [item("4")], unreadCount: 1, nextCursor: null }];
    await act(async () => {
      if (outcome === "offline") fail?.(new TypeError("Failed to fetch"));
      else
        finish?.(
          Response.json(
            {},
            { status: outcome === "success" ? 200 : outcome === "rejected" ? 409 : 500 },
          ),
        );
    });
    await waitFor(() => expect(hook.result.current.inbox.busy).toBe(false));
    await waitFor(() =>
      expect(hook.result.current.inbox.notifications.map((row) => row.id)).toEqual(
        saved
          ? [item("4").id]
          : original.pages.flatMap((page) => page.notifications.map((row) => row.id)),
      ),
    );
    await waitFor(() => expect(hook.result.current.bell.unreadCount).toBe(saved ? 1 : 7));
    expect(hook.result.current.inbox.hasMore).toBe(!saved);
    expect(feedback.onSuccess).not.toHaveBeenCalled();
    if (outcome === "success") expect(feedback.onError).not.toHaveBeenCalled();
    else
      expect(feedback.onError).toHaveBeenCalledExactlyOnceWith(
        expect.any(Error),
        outcome === "rejected" ? "delete_all_notifications" : "verify_saved_changes",
      );
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
    expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
    expect(client.getQueryState(otherApi)?.isInvalidated).toBe(false);
    hook.unmount();
    clearSessionQueryCache(client);
  },
);

it.each([undefined, null, "", ".", "..", "invalid"])(
  "never turns malformed single-row ID %j into a whole-inbox deletion",
  async (id) => {
    const { client, wrapper } = setup();
    const key = notificationListKey(options, 20);
    client.setQueryData(key, original);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    const hook = renderHook(() => useNotifications({ ...options, enabled: false, feedback }, 20), {
      wrapper,
    });
    await act(async () => {
      await expect(
        hook.result.current.deleteNotification.mutateAsync(id as string),
      ).rejects.toThrow("Invalid notification");
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(feedback.onOptimisticUpdate).not.toHaveBeenCalled();
    expect(feedback.onError).toHaveBeenCalledExactlyOnceWith(
      expect.any(Error),
      "delete_notification",
    );
    expect(client.getQueryData(key)).toBe(original);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    hook.unmount();
    clearSessionQueryCache(client);
  },
);

it("cannot overlap a bulk deletion with another notification write", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(notificationListKey(options, 20), original);
  let finish: ((response: Response) => void) | undefined;
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "DELETE"
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : Response.json(original.pages[0]),
  );
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useNotifications({ ...options, enabled: false }, 20), { wrapper });
  act(() => hook.result.current.deleteNotification.mutate(item("3").id));
  await waitFor(() => expect(finish).toBeDefined());
  await act(async () => {
    await expect(hook.result.current.deleteAllNotifications.mutateAsync()).rejects.toThrow(
      "MUTATION_IN_PROGRESS",
    );
  });
  expect(hook.result.current.notifications.map((row) => row.id)).toEqual([
    item("2").id,
    item("1").id,
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => finish?.(Response.json({})));
  hook.unmount();
  clearSessionQueryCache(client);
});

it.each(["token", "response"])(
  "does not send, restore or invalidate old-session deletion after a same-actor replacement (%s held)",
  async (held) => {
    const { client, wrapper } = setup();
    const key = notificationListKey(options, 20);
    client.setQueryData(key, original);
    let resolveToken: ((token: string) => void) | undefined;
    let finish: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const getToken = () =>
      held === "token"
        ? new Promise<string>((resolve) => {
            resolveToken = resolve;
          })
        : Promise.resolve("old-token");
    const feedback = { onError: vi.fn() };
    const hook = renderHook(
      () => useNotifications({ ...options, enabled: false, getToken, feedback }, 20),
      { wrapper },
    );
    act(() => hook.result.current.deleteAllNotifications.mutate());
    await waitFor(() => expect(held === "token" ? resolveToken : finish).toBeDefined());
    const replacement = {
      pages: [{ notifications: [item("f")], unreadCount: 1, nextCursor: null }],
      pageParams: [undefined],
    };
    act(() => {
      clearSessionQueryCache(client);
      client.setQueryData(key, replacement);
    });
    await act(async () => {
      if (held === "token") resolveToken?.("old-token");
      else finish?.(Response.json({}, { status: 500 }));
    });
    await waitFor(() => expect(hook.result.current.deleteAllNotifications.isPending).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(held === "token" ? 0 : 1);
    expect(client.getQueryData(key)).toEqual(replacement);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(feedback.onError).not.toHaveBeenCalled();
    hook.unmount();
    clearSessionQueryCache(client);
  },
);
