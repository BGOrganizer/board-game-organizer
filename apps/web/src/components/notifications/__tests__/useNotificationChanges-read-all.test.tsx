import {
  type NotificationChangeRow,
  type NotificationChangesPage,
  type NotificationChangesReceipt,
  type NotificationChangesScope,
  notificationItemId,
  type ReadNotificationChangesInput,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  notificationChangesQuery,
  useNotificationChanges,
} from "@board-game-organizer/shared";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const asOf = "2030-01-02T00:00:00.000Z";
const effectiveAt = "2030-01-01T00:00:00.000Z";
const scope: NotificationChangesScope = {
  kind: "group",
  id: "11111111-1111-4111-8111-111111111111",
  tab: "all",
};
const options = {
  apiUrl: "https://api.example.test",
  userId: "actor",
  getToken: async () => "fresh-token",
  enabled: true,
  protectionBypass: "preview",
};
const summary = (count: number) => ({
  tables: 0,
  events: 0,
  groups: count,
  contacts: 0,
  sections: { connections: 0, requests: 0, search: 0 },
});
const tabs = (count: number) => ({ details: count, members: 0, tables: 0, participants: 0 });
const id = (n: number) => String(n).padStart(24, "0");
const cursor = (n: number) =>
  JSON.stringify({ asOf, notificationId: id(n), itemId: "", effectiveAt });
function row(n: number, pending = false): NotificationChangeRow {
  const reference = { notificationId: id(n), effectiveAt };
  return {
    ...reference,
    messageCode: "information",
    title: "Source notification",
    description: "Original notification description",
    requiresResponse: pending,
    readReference: reference,
  };
}
function page(
  changes: NotificationChangeRow[],
  nextCursor: string | null = null,
): NotificationChangesPage {
  return { asOf, changes, nextCursor, tabCounts: tabs(changes.length) };
}
function receipt(
  input: ReadNotificationChangesInput,
  remaining: number,
): NotificationChangesReceipt {
  return {
    updated: input.references.length,
    readReferences: input.references,
    snapshot: { asOf, unreadCount: remaining, summary: summary(remaining), targets: [] },
    tabCounts: tabs(remaining),
    effects: {
      unread: input.references.length,
      summary: summary(input.references.length),
      targets: [],
      tabCounts: tabs(input.references.length),
    },
  };
}
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
const requestInput = (init?: RequestInit): ReadNotificationChangesInput =>
  JSON.parse(String(init?.body));
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it("reads the captured resource from the initial 8 to sequential 50-row pages, excluding pending decisions and coalescing double clicks", async () => {
  const { client, wrapper } = setup();
  const rows = Array.from({ length: 61 }, (_, index) =>
    row(100 - index, [99, 80].includes(100 - index)),
  );
  const reference = {
    ...rows[4].readReference,
    itemId: notificationItemId(scope.id, "overview", undefined, "group"),
    revision: 3,
  };
  rows[4] = { ...rows[4], ...reference, messageCode: "group_info", readReference: reference };
  let remaining = [...rows];
  const first = { ...page(rows.slice(0, 8), cursor(93)), tabCounts: tabs(rows.length) };
  const second = { ...page(rows.slice(8, 58), cursor(43)), tabCounts: tabs(rows.length) };
  const third = { ...page(rows.slice(58)), tabCounts: tabs(rows.length) };
  const gate = Promise.withResolvers<Response>();
  const writes: ReadNotificationChangesInput[] = [];
  const getToken = vi.fn(async () => "fresh-token");
  const foreignOptions = { ...options, userId: "foreign" };
  const foreignKey = notificationChangesQuery(foreignOptions, scope).queryKey;
  const foreign = { pages: [first], pageParams: [undefined] };
  client.setQueryData(foreignKey, foreign);
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const params = new URL(String(url)).searchParams;
    if (init?.method === "PATCH") {
      const input = requestInput(init);
      writes.push(input);
      remaining = remaining.filter(
        (change) => !input.references.some((ref) => ref.notificationId === change.notificationId),
      );
      const response = Response.json(receipt(input, remaining.length));
      if (writes.length === 1) {
        await gate.promise;
      }
      return response;
    }
    if (params.get("limit") === "50")
      return Response.json(params.get("cursor") === first.nextCursor ? second : third);
    return Response.json({
      ...page(remaining.slice(0, 8), remaining.length > 8 ? cursor(93) : null),
      tabCounts: tabs(remaining.length),
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useNotificationChanges({ ...options, getToken }, scope), {
    wrapper,
  });
  await waitFor(() => expect(hook.result.current.changes).toHaveLength(8));
  expect(writes).toEqual([]);
  let run: Promise<void> | undefined;
  act(() => {
    run = hook.result.current.markAllAsRead();
    void hook.result.current.markAllAsRead();
  });
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(hook.result.current.isReading).toBe(true);
  expect(
    fetcher.mock.calls.filter(([url]) => new URL(String(url)).searchParams.get("limit") === "50"),
  ).toHaveLength(0);
  await act(async () => {
    gate.resolve(Response.json({}));
    await run;
  });
  await waitFor(() => expect(hook.result.current.isReading).toBe(false));
  await waitFor(() =>
    expect(hook.result.current.changes.map((change) => change.notificationId)).toEqual([
      id(99),
      id(80),
    ]),
  );
  expect(hook.result.current.readError).toBeNull();
  expect(writes.map((input) => input.references.length)).toEqual([7, 49, 3]);
  expect(writes.every((input) => input.through === asOf && input.scope.tab === "all")).toBe(true);
  expect(writes.flatMap((input) => input.references)).toEqual(
    rows.filter((change) => !change.requiresResponse).map((change) => change.readReference),
  );
  const gets = fetcher.mock.calls.filter(([, init]) => init?.method === "GET");
  expect(new URL(String(gets[0][0])).searchParams.get("limit")).toBe("8");
  const bulkGets = gets.filter(([url]) => new URL(String(url)).searchParams.get("limit") === "50");
  expect(bulkGets.map(([url]) => new URL(String(url)).searchParams.get("cursor"))).toEqual([
    first.nextCursor,
    second.nextCursor,
  ]);
  for (const [url, init] of fetcher.mock.calls) {
    expect(new URL(String(url)).searchParams.get("x-vercel-protection-bypass")).toBe("preview");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer fresh-token" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
  expect(getToken).toHaveBeenCalledTimes(fetcher.mock.calls.length);
  expect(client.getQueryData(foreignKey)).toBe(foreign);
});

it.each(["page", "write", "snapshot"] as const)(
  "surfaces %s failure, stops the scan and permits explicit retry without re-reading committed references",
  async (failure) => {
    const { client, wrapper } = setup();
    const disabled = { ...options, enabled: false };
    const first = page([row(10)], cursor(10));
    const older = page([row(9)]);
    const key = notificationChangesQuery(disabled, scope).queryKey;
    client.setQueryData(key, { pages: [first], pageParams: [undefined] });
    let fail = true;
    const writes: ReadNotificationChangesInput[] = [];
    const successful: ReadNotificationChangesInput[] = [];
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const input = requestInput(init);
        writes.push(input);
        if (failure === "write" && fail)
          return Response.json({ error: "REJECTED" }, { status: 409 });
        successful.push(input);
        return Response.json(receipt(input, 0));
      }
      if (fail && failure === "page")
        return Response.json({ error: "UNAVAILABLE" }, { status: 503 });
      return Response.json(
        fail && failure === "snapshot" ? { ...older, asOf: "2030-01-03T00:00:00.000Z" } : older,
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const hook = renderHook(() => useNotificationChanges(disabled, scope), { wrapper });
    await act(async () => {
      await hook.result.current.markAllAsRead();
    });
    await waitFor(() => expect(hook.result.current.readError).toBeInstanceOf(Error));
    expect(hook.result.current.isReading).toBe(false);
    expect(hook.result.current.readError).toMatchObject({
      message:
        failure === "write"
          ? "REJECTED"
          : failure === "page"
            ? "UNAVAILABLE"
            : "Notification snapshot changed",
    });
    expect(writes).toHaveLength(1);
    expect(successful).toHaveLength(failure === "write" ? 0 : 1);
    if (failure === "write")
      expect(hook.result.current.changes.map((change) => change.notificationId)).toEqual([id(10)]);
    fail = false;
    await act(async () => {
      await hook.result.current.markAllAsRead();
    });
    await waitFor(() => expect(hook.result.current.readError).toBeNull());
    expect(hook.result.current.isReading).toBe(false);
    expect(
      successful.flatMap((input) => input.references.map((ref) => ref.notificationId)),
    ).toEqual([id(10), id(9)]);
    expect(writes).toHaveLength(failure === "write" ? 3 : 2);
  },
);

it.each(["user", "api", "locale", "unmount"] as const)(
  "aborts a pending snapshot GET on %s change and ignores a late page for the new owner",
  async (change) => {
    const { client, wrapper } = setup();
    const oldOptions = { ...options, locale: "en" as "en" | "it", enabled: false };
    const newOptions =
      change === "api"
        ? { ...oldOptions, apiUrl: "https://other.example.test" }
        : change === "locale"
          ? { ...oldOptions, locale: "it" as const }
          : { ...oldOptions, userId: "new-owner" };
    const oldKey = notificationChangesQuery(oldOptions, scope).queryKey;
    const newKey = notificationChangesQuery(newOptions, scope).queryKey;
    const oldData = { pages: [page([row(99, true)], cursor(99))], pageParams: [undefined] };
    const newData = { pages: [page([row(1)])], pageParams: [undefined] };
    client.setQueryData(oldKey, oldData);
    client.setQueryData(newKey, newData);
    const gate = Promise.withResolvers<Response>();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return gate.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    const hook = renderHook(({ owner }) => useNotificationChanges(owner, scope), {
      wrapper,
      initialProps: { owner: oldOptions },
    });
    let run: Promise<void> | undefined;
    act(() => {
      run = hook.result.current.markAllAsRead();
    });
    await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
    expect(signal?.aborted).toBe(false);
    if (change === "unmount") hook.unmount();
    else hook.rerender({ owner: newOptions });
    expect(signal?.aborted).toBe(true);
    // Deliberately ignore AbortSignal in the fake transport: old responses must still be fenced.
    await act(async () => {
      gate.resolve(Response.json(page([row(9)])));
      await run;
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("locale")).toBe("en");
    expect(client.getQueryData(newKey)).toBe(newData);
    if (change !== "unmount") {
      expect(hook.result.current.changes.map((entry) => entry.notificationId)).toEqual([id(1)]);
      expect(hook.result.current.readError).toBeNull();
      expect(hook.result.current.isReading).toBe(false);
    }
  },
);

it("resets only the revealed window and retains every authoritative cached page", async () => {
  const { client, wrapper } = setup();
  const disabled = { ...options, enabled: false };
  const data: InfiniteData<NotificationChangesPage> = {
    pages: Array.from({ length: 5 }, (_, index) =>
      page(
        Array.from({ length: 8 }, (_, offset) => row(100 - index * 8 - offset)),
        cursor(93 - index * 8),
      ),
    ),
    pageParams: [undefined, cursor(93), cursor(85), cursor(77), cursor(69)],
  };
  const key = notificationChangesQuery(disabled, scope).queryKey;
  client.setQueryData(key, data);
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const hook = renderHook(() => useNotificationChanges(disabled, scope), { wrapper });
  expect(hook.result.current.changes).toHaveLength(8);
  for (let index = 0; index < 3; index++)
    await act(async () => {
      await hook.result.current.fetchNextPage();
    });
  expect(hook.result.current.changes).toHaveLength(24);
  expect(hook.result.current.changes[0].notificationId).toBe(id(92));
  act(() => hook.result.current.resetWindow());
  expect(hook.result.current.changes.map((entry) => entry.notificationId)).toEqual(
    data.pages[0].changes.map((entry) => entry.notificationId),
  );
  expect(hook.result.current.hasNextPage).toBe(true);
  expect(client.getQueryData(key)).toBe(data);
  expect(fetcher).not.toHaveBeenCalled();
});
