import {
  type NotificationAttentionSnapshot,
  type NotificationChangeRow,
  type NotificationChangesPage,
  type NotificationChangesScope,
  type NotificationDto,
  type NotificationListResponse,
  notificationAttentionSnapshotSchema,
  notificationChangesPageSchema,
  notificationChangesReceiptSchema,
  notificationItemId,
  type ReadNotificationChangesInput,
  readNotificationChangesSchema,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  notificationAttentionQuery,
  notificationChangesQuery,
  notificationListKey,
  useNotificationAttention,
  useNotificationChanges,
  useNotificationSummary,
} from "@board-game-organizer/shared";
import { type InfiniteData, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const asOf = "2026-01-02T00:00:00.000Z";
const effectiveAt = "2026-01-01T00:00:00.000Z";
const scope: NotificationChangesScope = {
  kind: "group",
  id: "11111111-1111-4111-8111-111111111111",
  tab: "all",
};
const group = { kind: "group", id: scope.id } as const;
const contacts = { kind: "contacts", id: "connections" } as const;
const targets = [group, contacts];
type Owner = Parameters<typeof useNotificationChanges>[0];
const options: Owner = {
  apiUrl: "https://notifications.example.test",
  userId: "user_actor",
  getToken: async () => "fresh-token",
  protectionBypass: "preview",
  locale: "en",
  enabled: false,
};
const summary = (groups: number, count = 2) => ({
  tables: 0,
  events: 0,
  groups,
  contacts: count,
  sections: { connections: count, requests: 0, search: 0 },
});
const tabs = (members: number, details = 1) => ({
  details,
  members,
  tables: 0,
  participants: 0,
});
function change(n: number, pending = false): NotificationChangeRow {
  const reference = {
    notificationId: n.toString(16).padStart(24, "0"),
    itemId: notificationItemId(
      scope.id,
      pending ? "invitation" : "member",
      pending ? undefined : `user_member_${n}`,
      "group",
    ),
    revision: 1,
    effectiveAt,
  };
  return {
    ...reference,
    messageCode: pending ? "invitation" : "member_update",
    title: pending ? "Group invitation" : "Group membership updated",
    description: pending ? "Respond to the invitation" : "A member joined the group",
    requiresResponse: pending,
    readReference: reference,
  };
}
const initialRows = [change(1), change(2), change(3, true)];
function page(rows = initialRows, snapshot = asOf): NotificationChangesPage {
  return notificationChangesPageSchema.parse({
    asOf: snapshot,
    changes: rows,
    nextCursor: null,
    tabCounts: tabs(
      rows.filter((row) => !row.requiresResponse).length,
      rows.filter((row) => row.requiresResponse).length,
    ),
  });
}
function attention(groups = 3, snapshot = asOf): NotificationAttentionSnapshot {
  return notificationAttentionSnapshotSchema.parse({
    asOf: snapshot,
    unreadCount: groups + 2,
    summary: summary(groups),
    targets: [
      { target: group, count: groups, direct: groups, events: 0, sections: summary(0, 0).sections },
      { target: contacts, count: 2, direct: 2, events: 0, sections: summary(0).sections },
    ],
  });
}
function receipt(input: ReadNotificationChangesInput, accepted = input.references) {
  const count = accepted.length;
  return notificationChangesReceiptSchema.parse({
    updated: count,
    readReferences: accepted,
    snapshot: attention(3 - count),
    tabCounts: tabs(2 - count),
    effects: {
      unread: count,
      summary: summary(count, 0),
      targets: [{ target: group, count, direct: count, events: 0 }],
      tabCounts: tabs(count, 0),
    },
  });
}
function inbox(): InfiniteData<NotificationListResponse> {
  const notifications: NotificationDto[] = initialRows.map((row) => ({
    id: row.notificationId,
    kind: row.requiresResponse ? "group_invitation" : "group_membership_updated",
    title: row.title,
    description: row.description,
    href: `/groups/${scope.id}`,
    createdAt: row.effectiveAt,
    readAt: null,
    requiresResponse: row.requiresResponse,
    attention: { target: group, groupId: scope.id, itemIds: [row.itemId ?? ""] },
    attentionItems: [
      { id: row.itemId ?? "", revision: 1, changedAt: row.effectiveAt, readAt: null },
    ],
  }));
  for (const n of [4, 5])
    notifications.push({
      id: n.toString(16).padStart(24, "0"),
      kind: "friend_request_accepted",
      title: "Contact connected",
      description: "A contact accepted the connection",
      href: "/contacts",
      createdAt: effectiveAt,
      readAt: null,
      attention: { target: { kind: "contact", id: `user_contact_${n}` }, section: "connections" },
    });
  return {
    pages: [{ notifications, unreadCount: 5, attention: summary(3), nextCursor: null }],
    pageParams: [undefined],
  };
}
const clients: QueryClient[] = [];
function setup(seed = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  if (seed) client.setQueryData(notificationChangesQuery(options, scope).queryKey, data(page()));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
const data = (value: NotificationChangesPage): InfiniteData<NotificationChangesPage> => ({
  pages: [value],
  pageParams: [undefined],
});
function transport(
  read: () => Response | Promise<Response> = () => Response.json(page()),
  write: (input: ReadNotificationChangesInput) => Response | Promise<Response> = (input) =>
    Response.json(receipt(input)),
) {
  const writes: ReadNotificationChangesInput[] = [];
  const fetcher = vi.fn(async (value: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(value));
    expect(url.origin).toBe(options.apiUrl);
    expect(url.pathname).toBe("/api/notifications/changes");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-token");
    expect(url.searchParams.get("x-vercel-protection-bypass")).toBe("preview");
    if (init?.method === "PATCH") {
      expect(url.searchParams.get("navigation")).toBe("history");
      const input = readNotificationChangesSchema.parse(JSON.parse(String(init.body)));
      writes.push(input);
      return write(input);
    }
    expect(init?.method).toBe("GET");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ...scope,
      limit: "8",
      locale: "en",
      "x-vercel-protection-bypass": "preview",
    });
    return read();
  });
  vi.stubGlobal("fetch", fetcher);
  return { writes, fetcher };
}
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it.each(["http", "schema"] as const)(
  "exposes an initial %s read failure and recovers through an explicit read without acknowledging anything",
  async (failure) => {
    const { wrapper } = setup(false);
    let fail = true;
    const { writes } = transport(() =>
      !fail
        ? Response.json(page())
        : failure === "http"
          ? Response.json({ error: "READ_UNAVAILABLE" }, { status: 503 })
          : Response.json({ changes: [] }),
    );
    const hook = renderHook(() => useNotificationChanges({ ...options, enabled: true }, scope), {
      wrapper,
    });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.changes).toEqual([]);
    expect(writes).toEqual([]);
    fail = false;
    await act(async () => {
      await hook.result.current.refetch();
    });
    await waitFor(() => expect(hook.result.current.changes).toEqual(initialRows));
    expect(hook.result.current.isError).toBe(false);
    expect(writes).toEqual([]);
  },
);

it("commits only source-accepted displayed references across changes, attention and the inbox, retaining consent and unrelated owners", async () => {
  const { client, wrapper } = setup();
  const attentionKey = notificationAttentionQuery(options, targets).queryKey;
  const inboxKey = notificationListKey(options, 3);
  client.setQueryData(attentionKey, attention());
  client.setQueryData(inboxKey, inbox());
  const foreignKeys = [
    notificationChangesQuery({ ...options, userId: "user_foreign" }, scope).queryKey,
    notificationChangesQuery({ ...options, apiUrl: "https://other.example.test" }, scope).queryKey,
  ];
  const foreign = data(page());
  for (const key of foreignKeys) client.setQueryData(key, foreign);
  const gate = Promise.withResolvers<Response>();
  const { writes, fetcher } = transport(undefined, () => gate.promise);
  const hook = renderHook(
    () => ({
      changes: useNotificationChanges(options, scope),
      attention: useNotificationAttention(options, targets),
      summary: useNotificationSummary({ ...options, enabled: false }),
    }),
    { wrapper },
  );
  expect(hook.result.current.changes.changes).toHaveLength(3);
  expect(fetcher).not.toHaveBeenCalled();
  act(() => hook.result.current.changes.markDisplayedAsRead());
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    scope,
    through: asOf,
    references: initialRows.slice(0, 2).map((row) => row.readReference),
  });
  expect(hook.result.current.changes.changes).toEqual([initialRows[2]]);
  expect(hook.result.current.attention.get(group)?.count).toBe(3);
  expect(hook.result.current.summary).toEqual(summary(3));
  act(() => hook.result.current.changes.markDisplayedAsRead());
  expect(writes).toHaveLength(1);
  await act(async () => gate.resolve(Response.json(receipt(writes[0], [writes[0].references[0]]))));
  await waitFor(() => expect(hook.result.current.changes.isReading).toBe(false));
  expect(hook.result.current.changes.changes).toEqual(initialRows.slice(1));
  expect(hook.result.current.changes.tabCounts).toEqual(tabs(1));
  expect(hook.result.current.attention.get(group)?.count).toBe(2);
  expect(hook.result.current.attention.get(contacts)?.count).toBe(2);
  expect(hook.result.current.summary).toEqual(summary(2));
  const cached = client.getQueryData<InfiniteData<NotificationListResponse>>(inboxKey)?.pages[0];
  expect(cached?.unreadCount).toBe(4);
  expect(cached?.notifications.map((row) => row.readAt)).toEqual([asOf, null, null, null, null]);
  expect(cached?.notifications[2].requiresResponse).toBe(true);
  for (const key of foreignKeys) expect(client.getQueryData(key)).toBe(foreign);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(["user", "api", "locale", "resource", "tab"] as const)(
  "rolls back a rejected displayed read and hides its error when the %s scope changes",
  async (changed) => {
    const { client, wrapper } = setup();
    const { writes } = transport(undefined, () =>
      Response.json({ error: "REFERENCE_CONFLICT" }, { status: 409 }),
    );
    const original = { owner: options, scope };
    const hook = renderHook(({ owner, scope }) => useNotificationChanges(owner, scope), {
      wrapper,
      initialProps: original,
    });
    act(() => hook.result.current.markDisplayedAsRead());
    await waitFor(() =>
      expect(hook.result.current.readError).toMatchObject({
        status: 409,
        code: "REFERENCE_CONFLICT",
      }),
    );
    const originalError = hook.result.current.readError;
    const originalMutation = client.getMutationCache().find({
      mutationKey: ["notifications", options.apiUrl, options.userId, "changes-read"],
      exact: true,
    });
    expect(originalMutation?.state.error).toBe(originalError);
    expect(hook.result.current.changes).toEqual(initialRows);
    expect(hook.result.current.isReading).toBe(false);
    const nextOwner = {
      ...options,
      ...(changed === "user" ? { userId: "user_next" } : {}),
      ...(changed === "api" ? { apiUrl: "https://other.example.test" } : {}),
      ...(changed === "locale" ? { locale: "it" as const } : {}),
    };
    const nextScope = {
      ...scope,
      ...(changed === "resource" ? { id: "22222222-2222-4222-8222-222222222222" } : {}),
      ...(changed === "tab" ? { tab: "members" as const } : {}),
    };
    hook.rerender({ owner: nextOwner, scope: nextScope });
    expect(hook.result.current.readError).toBeNull();
    expect(hook.result.current.changes).toEqual([]);
    hook.rerender(original);
    // Query resets its MutationObserver when API/user changes the mutation key; returning cannot reattach it.
    if (changed === "user" || changed === "api") {
      expect(hook.result.current.readError).toBeNull();
    } else {
      expect(hook.result.current.readError).toBe(originalError);
    }
    expect(
      client.getMutationCache().find({
        mutationKey: ["notifications", options.apiUrl, options.userId, "changes-read"],
        exact: true,
      }),
    ).toBe(originalMutation);
    expect(originalMutation?.state.status).toBe("error");
    expect(originalMutation?.state.error).toBe(originalError);
    expect(hook.result.current.changes).toEqual(initialRows);
    expect(writes).toHaveLength(1);
  },
);

it("preserves a newer source revision and newer tab counts when an older displayed ACK arrives", async () => {
  const { client, wrapper } = setup();
  const gate = Promise.withResolvers<Response>();
  const newerAsOf = "2026-01-03T00:00:00.000Z";
  const newerReference = {
    ...initialRows[0].readReference,
    revision: 2,
    effectiveAt: "2026-01-02T12:00:00.000Z",
  };
  const newer = { ...initialRows[0], ...newerReference, readReference: newerReference };
  const fresh = page([newer, initialRows[2]], newerAsOf);
  const { writes } = transport(
    () => Response.json(fresh),
    () => gate.promise,
  );
  const hook = renderHook(() => useNotificationChanges(options, scope), { wrapper });
  act(() => hook.result.current.markDisplayedAsRead());
  await waitFor(() => expect(writes).toHaveLength(1));
  await act(async () => {
    await client.fetchInfiniteQuery({ ...notificationChangesQuery(options, scope), staleTime: 0 });
  });
  await waitFor(() => expect(hook.result.current.changes).toEqual([newer, initialRows[2]]));
  await act(async () => gate.resolve(Response.json(receipt(writes[0]))));
  await waitFor(() => expect(hook.result.current.isReading).toBe(false));
  expect(hook.result.current.changes).toEqual([newer, initialRows[2]]);
  expect(hook.result.current.tabCounts).toEqual(tabs(1));
});

it("verifies an unknown write outcome through the real read query before releasing the optimistic projection", async () => {
  const { wrapper } = setup();
  const verification = Promise.withResolvers<Response>();
  const { writes, fetcher } = transport(
    () => verification.promise,
    () => Response.json({}),
  );
  const hook = renderHook(() => useNotificationChanges(options, scope), { wrapper });
  act(() => hook.result.current.markDisplayedAsRead());
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(hook.result.current.isReading).toBe(true);
  expect(hook.result.current.changes).toEqual([initialRows[2]]);
  await act(async () => verification.resolve(Response.json(page())));
  await waitFor(() =>
    expect(hook.result.current.readError).toMatchObject({
      status: 502,
      code: "MUTATION_OUTCOME_UNKNOWN",
    }),
  );
  expect(hook.result.current.isReading).toBe(false);
  expect(hook.result.current.changes).toEqual(initialRows);
  expect(writes).toHaveLength(1);
});

it.each(["empty", "pending", "anonymous"] as const)(
  "does not implicitly read %s changes on entry, refetch, or an unavailable displayed-read action",
  async (mode) => {
    const { client, wrapper } = setup(false);
    const owner = mode === "anonymous" ? { ...options, userId: null } : options;
    const rows = mode === "empty" ? [] : mode === "pending" ? [initialRows[2]] : initialRows;
    client.setQueryData(notificationChangesQuery(owner, scope).queryKey, data(page(rows)));
    const { writes, fetcher } = transport(() => Response.json(page(rows)));
    const hook = renderHook(() => useNotificationChanges(owner, scope), { wrapper });
    expect(hook.result.current.changes).toEqual(rows);
    act(() => hook.result.current.markDisplayedAsRead());
    await act(async () => {
      await hook.result.current.refetch();
    });
    expect(writes).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(mode === "anonymous" ? 0 : 1);
    expect(hook.result.current.changes).toEqual(rows);
    await waitFor(() => expect(hook.result.current.isError).toBe(mode === "anonymous"));
  },
);

it("prevents a late session token from sending an ACK or changing a replacement session cache after purge", async () => {
  const { client, wrapper } = setup();
  const token = Promise.withResolvers<string>();
  const getToken = vi.fn(() => token.promise);
  const { fetcher } = transport();
  const hook = renderHook(() => useNotificationChanges({ ...options, getToken }, scope), {
    wrapper,
  });
  act(() => hook.result.current.markDisplayedAsRead());
  await waitFor(() => expect(getToken).toHaveBeenCalledTimes(1));
  const replacement = data(page([change(9)]));
  act(() => {
    clearSessionQueryCache(client);
    client.setQueryData(notificationChangesQuery(options, scope).queryKey, replacement);
  });
  await act(async () => token.resolve("fresh-token"));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(fetcher).not.toHaveBeenCalled();
  expect(client.getQueryData(notificationChangesQuery(options, scope).queryKey)).toBe(replacement);
});
