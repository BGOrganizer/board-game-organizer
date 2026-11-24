import {
  type NotificationAttentionCount,
  type NotificationAttentionSnapshot,
  type NotificationAttentionTarget,
  type ReadNotificationAttentionInput,
  readNotificationAttentionSchema,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  NotificationAttentionProvider,
  notificationAttentionQuery,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const group = { kind: "group", id: "11111111-1111-4111-8111-111111111111" } as const;
const event = { kind: "event", id: "22222222-2222-4222-8222-222222222222" } as const;
const options = {
  apiUrl: "https://api.example.test",
  userId: "actor",
  getToken: async () => "fresh-token",
};
const asOf = "2026-01-02T00:00:00.000Z";
const refreshed = "2026-01-03T00:00:00.000Z";
const sections = { connections: 0, requests: 0, search: 0 };

function snapshot(
  target: NotificationAttentionTarget,
  direct: number,
  time = asOf,
): NotificationAttentionSnapshot {
  const row: NotificationAttentionCount = { target, count: direct, direct, events: 0, sections };
  return {
    asOf: time,
    unreadCount: direct,
    summary: {
      groups: target.kind === "group" ? direct : 0,
      events: target.kind === "event" ? direct : 0,
      tables: 0,
      contacts: 0,
      sections,
    },
    targets: [row],
  };
}
const clients: QueryClient[] = [];
function clientWithAttention() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  client.setQueryData(notificationAttentionQuery(options, [group]).queryKey, snapshot(group, 2));
  client.setQueryData(notificationAttentionQuery(options, [event]).queryKey, snapshot(event, 5));
  return client;
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it("keeps nested attention in the same account and API scope", () => {
  const client = clientWithAttention();
  const innerClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(innerClient);
  innerClient.setQueryData(
    notificationAttentionQuery(options, [event]).queryKey,
    snapshot(event, 5),
  );
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const [apiUrl, userId] of [
    [options.apiUrl, options.userId],
    [options.apiUrl, "another"],
    ["https://other-api.example.test", options.userId],
  ]) {
    const inner = { ...options, apiUrl, userId, enabled: false };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NotificationAttentionProvider options={{ ...options, enabled: false }} targets={[group]}>
          <QueryClientProvider client={innerClient}>
            <NotificationAttentionProvider options={inner} targets={[event]}>
              {children}
            </NotificationAttentionProvider>
          </QueryClientProvider>
        </NotificationAttentionProvider>
      </QueryClientProvider>
    );
    const view = renderHook(useNotificationAttentionContext, { wrapper });
    const own = apiUrl === options.apiUrl && userId === options.userId;
    expect(view.result.current?.get(group)?.direct).toBe(own ? 2 : undefined);
    expect(view.result.current?.get(event)?.direct).toBe(own ? 5 : undefined);
    view.unmount();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["still-unread", "read-elsewhere"] as const)(
  "refreshes the source before retrying a failed attention read: %s",
  async (outcome) => {
    const client = clientWithAttention();
    let source = snapshot(group, 2);
    let refreshFails = false;
    let writes: ReadNotificationAttentionInput[] = [];
    const fetcher = vi.fn(async (value: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(value));
      expect(url.pathname).toBe("/api/notifications/attention");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-token");
      if (init?.method === "PATCH") {
        const input = readNotificationAttentionSchema.parse(JSON.parse(String(init.body)));
        writes = [...writes, input];
        if (writes.length === 1) return Response.json({ code: "STALE_ATTENTION" }, { status: 409 });
        source = snapshot(group, 0, refreshed);
        return Response.json({ updated: 2, snapshot: source });
      }
      expect(init?.method).toBe("GET");
      if (refreshFails) return Response.json({ code: "UNAVAILABLE" }, { status: 503 });
      return Response.json(source);
    });
    vi.stubGlobal("fetch", fetcher);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NotificationAttentionProvider options={options} targets={[group]}>
          {children}
        </NotificationAttentionProvider>
      </QueryClientProvider>
    );
    const view = renderHook(useNotificationAttentionContext, { wrapper });
    expect(view.result.current?.get(group)?.direct).toBe(2);
    act(() => view.result.current?.read(group));
    await waitFor(() => expect(view.result.current?.error).toBeInstanceOf(Error));
    expect(writes).toEqual([{ target: group, through: asOf }]);
    expect(view.result.current?.get(group)?.direct).toBe(2);

    refreshFails = true;
    await act(async () => {
      await view.result.current?.refetch();
    });
    expect(writes).toHaveLength(1);
    expect(view.result.current?.error).toBeInstanceOf(Error);

    refreshFails = false;
    source = snapshot(group, outcome === "still-unread" ? 2 : 0, refreshed);
    await act(async () => {
      await view.result.current?.refetch();
    });
    if (outcome === "still-unread") {
      await waitFor(() => expect(writes).toHaveLength(2));
      expect(writes[1]).toEqual({ target: group, through: refreshed });
    } else {
      expect(writes).toHaveLength(1);
    }
    await waitFor(() => expect(view.result.current?.get(group)?.direct).toBe(0));
    expect(view.result.current?.error).toBeUndefined();
  },
);
