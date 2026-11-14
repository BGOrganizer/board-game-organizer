import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  eventRecordKeys,
  eventRecordQuery,
  eventRecordsQuery,
  recordTableQuery,
  recordTablesQuery,
  useEventRecord,
  useEventRecords,
  useRecordTable,
  useRecordTables,
  useTableSeats,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable, seat, tableId } from "@/test-fixtures/eventRecords";
import { beginOptimisticOperation } from "../../../../../../packages/shared/src/common/optimisticOperation";
import { mapCommunityCache } from "../../../../../../packages/shared/src/community/queryCache";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    options = { apiUrl: "https://api.test", userId: "owner", getToken: vi.fn(async () => "fresh") };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, options, wrapper };
}
afterEach(() => vi.unstubAllGlobals());
it("hides excluded Tables from personal cache immediately but keeps the full Event table list", () => {
  const { client, options, wrapper } = setup();
  const included = {
    ...plannedTable,
    id: "included",
    eventStatus: "CONFIRMED" as const,
    confirmed: { gameId: 1, playerIds: ["owner", "two"], startsAt: "2030-06-03T18:00:00Z" },
  };
  const rows: PlannedTableResponse[] = [
    { ...plannedTable, myRegistration: seat("owner"), myPosition: "SEATED" },
    included,
    { ...plannedTable, id: "excluded-confirmed", eventStatus: "CONFIRMED" },
    { ...plannedTable, id: "excluded-terminated", eventStatus: "TERMINATED" },
  ];
  const cached = { pages: [{ items: rows, nextCursor: null }], pageParams: [""] };
  client.setQueryData(recordTablesQuery(options, null).queryKey, cached);
  client.setQueryData(recordTablesQuery(options, eventId).queryKey, cached);
  const q = renderHook(
    ({ id }: { id: string | null }) => useRecordTables({ ...options, enabled: false }, id),
    { wrapper, initialProps: { id: null as string | null } },
  );
  expect(q.result.current.items.map((row) => row.id)).toEqual(["included"]);
  q.rerender({ id: eventId });
  expect(q.result.current.items).toHaveLength(4);
});
it("drops restored Available rows that are closed, standalone, managed or already registered", () => {
  const { client, options, wrapper } = setup();
  const valid = {
    ...plannedEvent,
    id: "eligible",
    groupId: "club",
    canManage: false,
    myRegistrations: [],
  };
  const rows = [
    valid,
    { ...valid, id: "closed", canRegister: false },
    { ...valid, id: "standalone", groupId: null },
    { ...valid, id: "confirmed", status: "CONFIRMED" as const },
    { ...valid, id: "manager", canManage: true },
    { ...valid, id: "joined", myRegistrations: [seat("owner")] },
  ];
  client.setQueryData(eventRecordsQuery(options, { section: "available" }).queryKey, {
    pages: [{ items: rows, nextCursor: null }],
    pageParams: [""],
  });
  const result = renderHook(
    () => useEventRecords({ ...options, enabled: false }, { section: "available" }),
    { wrapper },
  );
  expect(result.result.current.items.map((row) => row.id)).toEqual(["eligible"]);
});
it("canonicalizes equivalent first-page keys and scopes identities by API/user/resource", () => {
  const { options: o } = setup();
  expect(eventRecordsQuery(o).queryKey).toEqual(
    eventRecordsQuery(o, { query: "", periods: ["future", "past"] }).queryKey,
  );
  expect(recordTablesQuery(o, null).queryKey).toEqual(
    recordTablesQuery(o, null, { query: "", periods: ["past", "future"] }).queryKey,
  );
  expect(
    eventRecordsQuery(o, { statuses: ["TERMINATED", "CONFIRMED", "PLANNING"] }).queryKey,
  ).toEqual(eventRecordsQuery(o).queryKey);
  expect(
    recordTablesQuery(o, null, { statuses: ["PLANNING", "TERMINATED", "CONFIRMED"] }).queryKey,
  ).toEqual(recordTablesQuery(o, null).queryKey);
  expect(eventRecordsQuery(o, { statuses: [] }).queryKey).not.toEqual(
    eventRecordsQuery(o).queryKey,
  );
  expect(recordTablesQuery(o, null, { statuses: ["CONFIRMED"] }).queryKey).not.toEqual(
    recordTablesQuery(o, null, { statuses: ["PLANNING"] }).queryKey,
  );
  expect(recordTablesQuery(o, eventId, { statuses: ["CONFIRMED"] }).queryKey).toEqual(
    recordTablesQuery(o, eventId, { statuses: ["PLANNING"] }).queryKey,
  );
  expect(eventRecordsQuery({ ...o, userId: "other" }).queryKey).not.toEqual(
    eventRecordsQuery(o).queryKey,
  );
  expect(recordTablesQuery(o, eventId, { periods: ["past"] }).queryKey).toEqual(
    recordTablesQuery(o, eventId, { periods: ["future"] }).queryKey,
  );
  expect(eventRecordsQuery(o, { section: "available" }).queryKey).not.toEqual(
    eventRecordsQuery(o).queryKey,
  );
  expect(recordTablesQuery(o, null, { section: "mine" }).queryKey).not.toEqual(
    recordTablesQuery(o, null).queryKey,
  );
  expect(recordTablesQuery(o, null, { section: "waiting" }).queryKey).not.toEqual(
    recordTablesQuery(o, null).queryKey,
  );
  expect(eventRecordsQuery(o, { groupId: "group", section: "available" }).queryKey).toEqual(
    eventRecordsQuery(o, { groupId: "group" }).queryKey,
  );
  expect(recordTablesQuery(o, eventId, { section: "waiting" }).queryKey).toEqual(
    recordTablesQuery(o, eventId).queryKey,
  );
});
it("removes lifecycle-changed cached rows immediately without changing other filtered scopes", async () => {
  const { client, options, wrapper } = setup(),
    filters = { statuses: ["PLANNING"] as const };
  const eventKey = eventRecordsQuery(options, filters).queryKey,
    tableKey = recordTablesQuery(options, null, filters).queryKey;
  const event = { ...plannedEvent, myRegistrations: [seat("owner")] },
    table = { ...plannedTable, myRegistration: seat("owner") };
  client.setQueryData(eventKey, {
    pages: [{ items: [event], nextCursor: null }],
    pageParams: [""],
  });
  client.setQueryData(tableKey, {
    pages: [{ items: [table], nextCursor: null }],
    pageParams: [""],
  });
  const events = renderHook(() => useEventRecords({ ...options, enabled: false }, filters), {
    wrapper,
  });
  const tables = renderHook(() => useRecordTables({ ...options, enabled: false }, null, filters), {
    wrapper,
  });
  expect(events.result.current.items).toHaveLength(1);
  expect(tables.result.current.items).toHaveLength(0);
  act(() => {
    client.setQueryData(eventKey, {
      pages: [{ items: [{ ...event, status: "CONFIRMED" }], nextCursor: null }],
      pageParams: [""],
    });
    client.setQueryData(tableKey, {
      pages: [
        {
          items: [
            {
              ...table,
              eventStatus: "CONFIRMED",
              confirmed: {
                gameId: 1,
                playerIds: ["owner", "guest"],
                startsAt: "2030-06-03T18:00:00Z",
              },
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [""],
    });
  });
  await waitFor(() => expect(events.result.current.items).toEqual([]));
  expect(tables.result.current.items).toEqual([]);
});
it("does not borrow a legacy seat-only cache for the combined personal list and sends no section", async () => {
  const { client, options, wrapper } = setup();
  const pending = {
    ...plannedTable,
    id: "pending",
    myRegistration: { ...seat("owner"), status: "PENDING" as const },
  };
  client.setQueryData(recordTablesQuery(options, null, { section: "mine" }).queryKey, {
    pages: [{ items: [plannedTable], nextCursor: null }],
    pageParams: [""],
  });
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    expect(u.searchParams.has("section")).toBe(false);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ items: [pending], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetch);
  const q = renderHook(() => useRecordTables(options, null), { wrapper });
  expect(q.result.current.items).toEqual([]);
  await waitFor(() => expect(q.result.current.isSuccess).toBe(true));
  expect(q.result.current.items).toEqual([]);
  expect(options.getToken).toHaveBeenCalledTimes(1);
});

it("source-pages event lists with fresh credentials and abortable requests", async () => {
  const { options, wrapper } = setup(),
    fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(
        JSON.stringify({
          items: [plannedEvent],
          nextCursor: url.includes("cursor=") ? null : "next",
        }),
      );
    });
  vi.stubGlobal("fetch", fetch);
  const q = renderHook(
    () => useEventRecords(options, { groupId: "group", periods: ["future"], query: "club" }),
    { wrapper },
  );
  await waitFor(() => expect(q.result.current.items).toHaveLength(1));
  await act(async () => {
    await q.result.current.fetchNextPage();
  });
  await waitFor(() => expect(q.result.current.items).toHaveLength(2));
  expect(options.getToken).toHaveBeenCalledTimes(2);
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get("groupId")).toBe("group");
});
it("retains list summary while fetching missing event agreement/detail and never treats summary as fresh detail", async () => {
  const { client, options, wrapper } = setup();
  client.setQueryData(eventRecordsQuery(options).queryKey, {
    pages: [{ items: [{ ...plannedEvent, agreement: undefined }], nextCursor: null }],
    pageParams: [""],
  });
  let done!: (v: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          done = resolve;
        }),
    ),
  );
  const q = renderHook(() => useEventRecord(options, eventId), { wrapper });
  expect(q.result.current.data?.name).toBe(plannedEvent.name);
  expect(q.result.current.isPlaceholderData).toBe(true);
  await waitFor(() => expect(done).toBeDefined());
  await act(async () => {
    done(new Response(JSON.stringify(plannedEvent)));
  });
  await waitFor(() => expect(q.result.current.isPlaceholderData).toBe(false));
  expect(q.result.current.data?.agreement).toBeDefined();
});
it("seeds complete table metadata from cached first pages without a duplicate request, but fetches missing immutable result profiles", async () => {
  const { client, options, wrapper } = setup();
  client.setQueryData(recordTablesQuery(options, null).queryKey, {
    pages: [
      {
        items: [
          { ...plannedTable, gameVoteCounts: { "1": { YES: 0, NO: 0, IF_NEEDED: 0, UNKNOWN: 1 } } },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [""],
  });
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ ...plannedTable, eventStatus: "TERMINATED", resultProfiles: [] }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const initial = renderHook(() => useRecordTable(options, eventId, tableId), { wrapper });
  expect(initial.result.current.data?.name).toBe(plannedTable.name);
  expect(initial.result.current.isPlaceholderData).toBe(false);
  await act(async () => Promise.resolve());
  expect(fetch).not.toHaveBeenCalled();
  initial.unmount();
  client.removeQueries({ queryKey: eventRecordKeys.table(options, eventId, tableId) });
  client.setQueryData(recordTablesQuery(options, null).queryKey, {
    pages: [{ items: [{ ...plannedTable, eventStatus: "TERMINATED" }], nextCursor: null }],
    pageParams: [""],
  });
  const final = renderHook(() => useRecordTable(options, eventId, tableId), { wrapper });
  await waitFor(() => expect(final.result.current.data?.resultProfiles).toEqual([]));
  expect(fetch).toHaveBeenCalledOnce();
});
it("revalidates invalidated Table-list seeds instead of reviving a fresh-looking old invitation", async () => {
  const { client, options, wrapper } = setup();
  const key = recordTablesQuery(options, null).queryKey;
  const cached = { ...plannedTable, gameVoteCounts: {} };
  client.setQueryData(key, {
    pages: [{ items: [cached], nextCursor: null }],
    pageParams: [""],
  });
  await client.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
  const invitation = { ...seat("owner"), status: "PENDING" as const };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ...cached, myRegistration: invitation, canRespond: true })),
  );
  const hook = renderHook(() => useRecordTable(options, eventId, tableId), { wrapper });
  expect(hook.result.current.data?.name).toBe(plannedTable.name);
  await waitFor(() => expect(hook.result.current.data?.myRegistration).toEqual(invitation));
  expect(fetch).toHaveBeenCalledOnce();
  hook.unmount();
  client.clear();
});
it("does not absorb an optimistic Table-list projection into a newly opened detail", async () => {
  const { client, options, wrapper } = setup();
  const key = recordTablesQuery(options, null).queryKey;
  client.setQueryData(key, {
    pages: [{ items: [{ ...plannedTable, gameVoteCounts: {} }], nextCursor: null }],
    pageParams: [""],
  });
  const operation = await beginOptimisticOperation(
    client,
    [...eventRecordKeys.root(options), eventId],
    { queryKey: eventRecordKeys.root(options) },
    (data) =>
      mapCommunityCache<PlannedTableResponse>(data, (row) => ({ ...row, canRegister: false })),
  );
  const hook = renderHook(() => useRecordTable({ ...options, enabled: false }, eventId, tableId), {
    wrapper,
  });
  expect(hook.result.current.data?.canRegister).toBe(false);
  act(() => operation.rollback());
  await waitFor(() => expect(hook.result.current.data?.canRegister).toBe(true));
  hook.unmount();
  client.clear();
});
it("retains cached table fields while fetching missing vote totals instead of treating a list summary as complete", async () => {
  const { client, options, wrapper } = setup();
  client.setQueryData(recordTablesQuery(options, eventId).queryKey, {
    pages: [{ items: [plannedTable], nextCursor: null }],
    pageParams: [""],
  });
  let respond: ((value: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    ),
  );
  const q = renderHook(() => useRecordTable(options, eventId, tableId), { wrapper });
  expect(q.result.current.data?.name).toBe(plannedTable.name);
  expect(q.result.current.isPlaceholderData).toBe(true);
  await waitFor(() => expect(respond).toBeTypeOf("function"));
  if (!respond) throw new Error("Missing table request");
  const finish = respond;
  const counts = { "1": { YES: 1, NO: 0, IF_NEEDED: 0, UNKNOWN: 0 } };
  await act(async () =>
    finish(new Response(JSON.stringify({ ...plannedTable, gameVoteCounts: counts }))),
  );
  await waitFor(() => expect(q.result.current.isPlaceholderData).toBe(false));
  expect(q.result.current.data?.gameVoteCounts).toEqual(counts);
});
it("keeps paged accepted/pending seats distinct and filters optimistic cancellation without fabricating missing rows", async () => {
  const { options, wrapper } = setup();
  const accepted = seat("guest"),
    cancelled = { ...seat("cancelled"), status: "CANCELLED" };
  const fetch = vi.fn(
    async (_url: string) =>
      new Response(JSON.stringify({ items: [accepted, cancelled], nextCursor: null })),
  );
  vi.stubGlobal("fetch", fetch);
  const q = renderHook(() => useTableSeats(options, eventId, tableId), { wrapper });
  await waitFor(() => expect(q.result.current.items).toHaveLength(1));
  expect(q.result.current.items[0].userId).toBe("guest");
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get("pending")).toBe("false");
});
it("keeps network failures observable, does not fetch disabled identities and pages personal versus event table endpoints", async () => {
  const { options, wrapper } = setup();
  const fetch = vi.fn(async (_url: string) => new Response("{}", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  renderHook(() => useEventRecords({ ...options, enabled: false }), { wrapper });
  renderHook(() => useRecordTable({ ...options, userId: null }, eventId, tableId), { wrapper });
  expect(fetch).not.toHaveBeenCalled();
  const q = renderHook(() => useRecordTables(options, null, { periods: [], query: "table" }), {
    wrapper,
  });
  await waitFor(() => expect(q.result.current.isError).toBe(true));
  expect(String(fetch.mock.calls[0][0])).toContain("/api/tables?");
});

it.each(["event", "table", "events", "tables"] as const)(
  "reconciles verified %s personal access through its actual query factory",
  async (kind) => {
    const { client, options } = setup();
    const groupKey = ["groups", options.apiUrl, options.userId, "people", "revoked-group"];
    const otherKey = ["groups", options.apiUrl, options.userId, "people", "other-group"];
    client.setQueryData(groupKey, { items: [{ email: "private-member" }] });
    client.setQueryData(otherKey, { items: [{ userId: "allowed" }] });
    const row = {
      ...(kind === "table" || kind === "tables" ? plannedTable : plannedEvent),
      groupId: null,
      personalAccessOnly: true,
      readOnly: true,
      canManage: false,
      accessRevokedGroupId: "revoked-group",
    };
    const result =
      kind === "events" || kind === "tables" ? { items: [row], nextCursor: null } : row;
    const fetcher = vi.fn(async () => new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const query =
      kind === "event"
        ? eventRecordQuery(options, eventId)
        : kind === "table"
          ? recordTableQuery(options, eventId, tableId)
          : kind === "events"
            ? eventRecordsQuery(options)
            : recordTablesQuery(options, null);
    if (kind === "events")
      await client.fetchInfiniteQuery(eventRecordsQuery(options)).catch(() => undefined);
    else if (kind === "tables")
      await client.fetchInfiniteQuery(recordTablesQuery(options, null)).catch(() => undefined);
    else if (kind === "event")
      await client.fetchQuery(eventRecordQuery(options, eventId)).catch(() => undefined);
    else
      await client.fetchQuery(recordTableQuery(options, eventId, tableId)).catch(() => undefined);
    expect(client.getQueryData(query.queryKey)).toEqual(
      kind === "events" || kind === "tables" ? { pages: [result], pageParams: [""] } : result,
    );
    expect(client.getQueryData(groupKey)).toBeUndefined();
    expect(client.getQueryData(otherKey)).toEqual({ items: [{ userId: "allowed" }] });
    expect(options.getToken).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    client.clear();
  },
);
