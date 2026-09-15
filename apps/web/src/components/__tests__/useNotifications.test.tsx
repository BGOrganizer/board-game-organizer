import { useNotifications } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

  it("loads and paginates notifications with fresh auth and preview bypass", async () => {
    const { result } = renderHook(() => useNotifications(options, 1), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/notifications?limit=1&x-vercel-protection-bypass=bypass",
      { headers: { Authorization: "Bearer fresh-token" } },
    );
    await act(() => result.current.list.fetchNextPage());
    await waitFor(() =>
      expect(result.current.notifications.map(({ id }) => id)).toEqual(["first", "second"]),
    );
    expect(result.current.unreadCount).toBe(2);
    expect(result.current.hasMore).toBe(false);
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
