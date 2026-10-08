import type {
  EventBookingResponse,
  EventResponse,
  EventTableResponse,
  SaveEventInput,
} from "@board-game-organizer/schemas";
import { CommunityApiError, type CommunityApiOptions } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type BookingAction,
  eventBookingsQuery,
  eventDetailQuery,
  eventKeys,
  eventsPageQuery,
  eventTableQuery,
  eventTablesQuery,
  patchEventCache,
  useEvent,
  useEventActions,
  useEventBookings,
  useEventList,
  useEventTable,
  useEventTables,
} from "../../../../../../packages/shared/src/events/hooks/useEvents";
import {
  publicGroupsQuery,
  usePublicGroups,
} from "../../../../../../packages/shared/src/groups/hooks/usePublicGroups";

const event = {
  id: "event",
  organizationId: "org",
  name: "Community evening",
  version: 2,
  status: "PUBLISHED",
  role: "admin",
  location: {
    id: "address",
    name: "Club",
    address: "Verified address",
    longitude: 12,
    latitude: 45,
  },
  startsAt: "2030-01-01T18:00:00.000Z",
  endsAt: "2030-01-01T22:00:00.000Z",
  bookingClosesAt: "2029-12-31T18:00:00.000Z",
  timeZone: "UTC",
  tableCount: 1,
  canModify: true,
} as EventResponse;
const table: EventTableResponse = {
  id: "table",
  eventId: event.id,
  name: "Table one",
  gameId: 1,
  gameName: "Game",
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  minPlayers: 2,
  maxPlayers: 4,
  openSkill: false,
  status: "PLANNING",
  createdAt: event.startsAt,
  updatedAt: event.startsAt,
  confirmedCount: 1,
  reservedCount: 2,
  canBook: true,
  myBooking: null,
  image: null,
  demonstrator: null,
};
const booking = {
  id: "booking",
  eventId: event.id,
  tableId: table.id,
  userId: "user",
  status: "PENDING",
  kind: "INVITATION",
} as EventBookingResponse;
const input = {
  name: event.name,
  location: event.location,
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  bookingClosesAt: event.bookingClosesAt,
  timeZone: event.timeZone,
  status: "DRAFT",
  tables: [],
} as SaveEventInput;
const options: CommunityApiOptions = {
  apiUrl: "https://api.example.test",
  userId: "user",
  getToken: vi.fn(async () => "fresh-token"),
  feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() },
};
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("event reads and public-group discovery", () => {
  it("source-pages lists, tables and bookings with fresh tokens, then seeds only owning event details", async () => {
    const { client, wrapper } = setup();
    const foreign = { ...options, userId: "other" };
    client.setQueryData(eventKeys.detail(foreign, event.id), {
      ...event,
      name: "Private foreign cache",
    });
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer fresh-token");
      const uri = new URL(url);
      const cursor = uri.searchParams.get("cursor");
      if (uri.pathname.endsWith("/bookings"))
        return response({
          items: [cursor ? { ...booking, id: "b2" } : booking],
          nextCursor: cursor ? null : "booking-cursor",
        });
      if (uri.pathname.endsWith("/tables"))
        return response({
          items: [cursor ? { ...table, id: "t2" } : table],
          nextCursor: cursor ? null : "table-cursor",
        });
      return response({
        items: [cursor ? { ...event, id: "event2" } : event],
        nextCursor: cursor ? null : "event-cursor",
      });
    });
    vi.stubGlobal("fetch", fetch);
    const hook = renderHook(
      () => ({
        events: useEventList(options, "org", "even"),
        tables: useEventTables(options, event.id, "table"),
        bookings: useEventBookings(options, event.id, table.id),
      }),
      { wrapper },
    );
    await waitFor(() => expect(hook.result.current.events.items).toHaveLength(1));
    await waitFor(() => expect(hook.result.current.tables.items).toHaveLength(1));
    await waitFor(() => expect(hook.result.current.bookings.items).toHaveLength(1));
    await act(async () => {
      await hook.result.current.events.fetchNextPage();
      await hook.result.current.tables.fetchNextPage();
      await hook.result.current.bookings.fetchNextPage();
    });
    await waitFor(() => expect(hook.result.current.events.items).toHaveLength(2));
    await waitFor(() => expect(hook.result.current.tables.items).toHaveLength(2));
    await waitFor(() => expect(hook.result.current.bookings.items).toHaveLength(2));
    expect(hook.result.current.events.hasNextPage).toBe(false);
    expect(options.getToken).toHaveBeenCalledTimes(6);
    expect(client.getQueryData(eventKeys.detail(options, event.id))).toEqual(event);
    expect(client.getQueryData(eventKeys.detail(foreign, event.id))).toEqual({
      ...event,
      name: "Private foreign cache",
    });
    expect(
      fetch.mock.calls.some(
        ([url]) => url.includes("/organizations/org/events") && url.includes("query=even"),
      ),
    ).toBe(true);
  });
  it("does not overwrite newer authorized detail with an older list version", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(eventKeys.detail(options, event.id), {
      ...event,
      version: 9,
      name: "Newer details",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ items: [event], nextCursor: null })),
    );
    const h = renderHook(() => useEventList(options), { wrapper });
    await waitFor(() => expect(h.result.current.items).toHaveLength(1));
    expect(client.getQueryData<EventResponse>(eventKeys.detail(options, event.id))?.version).toBe(
      9,
    );
  });
  it("reads individual event/table endpoints and handles complete empty first pages", async () => {
    const { wrapper } = setup();
    const fetch = vi.fn(async (url: string) =>
      response(
        url.endsWith("/tables/table")
          ? table
          : url.endsWith("/events/event")
            ? event
            : { items: [], nextCursor: null },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const h = renderHook(
      () => ({
        detail: useEvent(options, event.id),
        table: useEventTable(options, event.id, table.id),
        events: useEventList(options),
        tables: useEventTables(options, event.id),
        bookings: useEventBookings(options, event.id, table.id),
      }),
      { wrapper },
    );
    await waitFor(() => expect(h.result.current.detail.isSuccess).toBe(true));
    await waitFor(() => expect(h.result.current.table.data).toEqual(table));
    expect(h.result.current.events.items).toEqual([]);
    expect(h.result.current.tables.items).toEqual([]);
    expect(h.result.current.bookings.items).toEqual([]);
  });
  it("disables absent identities/resources, short searches and explicit disabled sessions", () => {
    for (const o of [
      { ...options, enabled: false },
      { ...options, userId: null },
      { ...options, apiUrl: "" },
    ]) {
      expect(eventsPageQuery(o).enabled).toBe(false);
      expect(eventDetailQuery(o, event.id).enabled).toBe(false);
      expect(eventTablesQuery(o, event.id).enabled).toBe(false);
      expect(eventTableQuery(o, event.id, table.id).enabled).toBe(false);
      expect(eventBookingsQuery(o, event.id, table.id).enabled).toBe(false);
      expect(publicGroupsQuery(o, "chess").enabled).toBe(false);
    }
    expect(eventDetailQuery(options, "").enabled).toBe(false);
    expect(eventTablesQuery(options, "").enabled).toBe(false);
    expect(eventTableQuery(options, event.id, "").enabled).toBe(false);
    expect(eventTableQuery(options, "", table.id).enabled).toBe(false);
    expect(eventBookingsQuery(options, event.id, "").enabled).toBe(false);
    expect(eventBookingsQuery(options, "", table.id).enabled).toBe(false);
    expect(publicGroupsQuery(options, "abc").enabled).toBe(false);
    expect(publicGroupsQuery(options, "chess").enabled).toBe(true);
  });
  it("paginates public groups and preserves a failed lookup as an observable error", async () => {
    const { wrapper } = setup();
    const fetch = vi.fn(async (url: string) =>
      response({
        items: [
          {
            id: url.includes("cursor=") ? "g2" : "g1",
            name: "Public group",
            memberCount: 2,
            createdAt: event.startsAt,
          },
        ],
        nextCursor: url.includes("cursor=") ? null : "next",
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const h = renderHook(() => usePublicGroups(options, "chess"), { wrapper });
    await waitFor(() => expect(h.result.current.items).toHaveLength(1));
    await act(async () => {
      await h.result.current.fetchNextPage();
    });
    await waitFor(() => expect(h.result.current.items).toHaveLength(2));
    expect(h.result.current.hasNextPage).toBe(false);
    fetch.mockImplementation(async () => response({ error: "UPSTREAM_FAILED" }, 500));
    const failed = renderHook(() => useEvent(options, "missing"), { wrapper });
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
    expect(failed.result.current.error).toBeInstanceOf(CommunityApiError);
  });
});
describe("deadline cache transition", () => {
  it.each([true, false])(
    "revalidates once at cutoff without hiding cached fields or polling (success=%s)",
    async (success) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2030-01-01T11:59:59.000Z"));
      const { client, wrapper } = setup(),
        pending = { ...event, bookingClosesAt: "2030-01-01T12:00:00.000Z" };
      client.setQueryData(eventKeys.detail(options, event.id), pending);
      client.setQueryData(eventKeys.tables(options, event.id, ""), {
        pages: [{ items: [table], nextCursor: null }],
        pageParams: [""],
      });
      client.setQueryData(eventKeys.list(options, "org", ""), {
        pages: [{ items: [pending], nextCursor: null }],
        pageParams: [""],
      });
      const foreign = eventKeys.detail({ ...options, userId: "other" }, event.id);
      client.setQueryData(foreign, pending);
      const fetch = vi.fn(async (url: string) =>
        success
          ? response(
              new URL(url).pathname.endsWith("/tables")
                ? { items: [], nextCursor: null }
                : url.endsWith("/events/event")
                  ? { ...pending, closedAt: pending.bookingClosesAt, canModify: false }
                  : {
                      items: [{ ...pending, closedAt: pending.bookingClosesAt }],
                      nextCursor: null,
                    },
            )
          : response({ error: "OFFLINE" }, 500),
      );
      vi.stubGlobal("fetch", fetch);
      const h = renderHook(
        () => ({
          detail: useEvent(options, event.id),
          tables: useEventTables(options, event.id),
          list: useEventList(options, "org"),
        }),
        { wrapper },
      );
      expect(fetch).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1010);
      });
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(h.result.current.detail.data?.name).toBe(event.name);
      expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(fetch).toHaveBeenCalledTimes(3);
      if (success) expect(h.result.current.tables.items).toEqual([]);
      else expect(h.result.current.detail.isError).toBe(true);
    },
  );
});
describe("immutable event cache transforms", () => {
  it("preserves unsupported objects and unrelated page identities, supports removals and detail patches", () => {
    const page = { items: [event, { ...event, id: "other" }], nextCursor: null };
    const data = { pages: [page], pageParams: [""] };
    expect(patchEventCache(undefined, () => null)).toBeUndefined();
    expect(patchEventCache(null, () => null)).toBeNull();
    expect(patchEventCache("text", () => null)).toBe("text");
    const unknown = { unrelated: true };
    expect(patchEventCache(unknown, () => null)).toBe(unknown);
    expect(patchEventCache<EventResponse>(data, (row) => row)).toBe(data);
    expect(
      patchEventCache<EventResponse>(data, (row) => (row.id === event.id ? null : row)),
    ).toEqual({ pages: [{ ...page, items: [page.items[1]] }], pageParams: [""] });
    expect(data.pages[0].items).toHaveLength(2);
    expect(patchEventCache<EventResponse>(event, () => null)).toBe(event);
    expect(patchEventCache<EventResponse>(event, (row) => ({ ...row, name: "Changed" }))).toEqual({
      ...event,
      name: "Changed",
    });
  });
});
describe("event mutations", () => {
  const actions = ["accept", "decline", "approve", "reject", "cancel", "remove"] as const;
  it.each(actions)(
    "submits booking %s without fabricating acceptance, rolls failures back, preserves foreign caches",
    async (action: BookingAction) => {
      const { client, wrapper } = setup();
      const key = eventKeys.bookings(options, event.id, table.id);
      const snapshot = {
        pages: [{ items: [booking, { ...booking, id: "unrelated" }], nextCursor: null }],
        pageParams: [""],
      };
      client.setQueryData(key, snapshot);
      client.setQueryData(eventKeys.detail(options, event.id), event);
      const foreign = eventKeys.bookings({ ...options, userId: "other" }, event.id, table.id);
      client.setQueryData(foreign, snapshot);
      const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
        response({ error: "EVENT_CLOSED" }, 409),
      );
      vi.stubGlobal("fetch", fetch);
      const h = renderHook(() => useEventActions(options), { wrapper });
      await act(async () => {
        await expect(
          h.result.current.booking.mutateAsync({ id: booking.id, action, eventId: event.id }),
        ).rejects.toBeInstanceOf(CommunityApiError);
      });
      expect(client.getQueryData(key)).toEqual(snapshot);
      expect(client.getQueryData(foreign)).toBe(snapshot);
      expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ action });
      expect(options.feedback?.onOptimisticUpdate).toHaveBeenCalled();
      expect(options.feedback?.onError).toHaveBeenCalled();
      fetch.mockImplementation(async () =>
        response({
          ...booking,
          status: action === "accept" || action === "approve" ? "CONFIRMED" : "CANCELLED",
        }),
      );
      await act(async () => {
        await h.result.current.booking.mutateAsync({ id: booking.id, action, eventId: event.id });
      });
      expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
    },
  );
  it("cancels owning reads before optimistic edits, reconciles authoritative IDs/versions, rolls back all write types", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(eventKeys.detail(options, event.id), event);
    const listKey = eventKeys.list(options, "org", "");
    const list = { pages: [{ items: [event], nextCursor: null }], pageParams: [""] };
    client.setQueryData(listKey, list);
    const foreign = eventKeys.detail(
      { ...options, apiUrl: "https://other.example.test" },
      event.id,
    );
    client.setQueryData(foreign, event);
    const cancelled = vi.spyOn(client, "cancelQueries");
    const fetch = vi.fn(async () => response({ ...event, id: "server-id", version: 3 }));
    vi.stubGlobal("fetch", fetch);
    const h = renderHook(() => useEventActions(options), { wrapper });
    await act(async () => {
      await h.result.current.create.mutateAsync({ organizationId: "org", input });
    });
    expect(client.getQueryData(eventKeys.detail(options, "server-id"))).toEqual({
      ...event,
      id: "server-id",
      version: 3,
    });
    expect(cancelled).toHaveBeenCalledWith({ queryKey: eventKeys.root(options) });
    fetch.mockImplementation(async () =>
      response({ ...event, name: "Canonical title", version: 3 }),
    );
    await act(async () => {
      await h.result.current.update.mutateAsync({
        id: event.id,
        input: { ...input, name: "Changed", version: 2, removedTableIds: [] },
      });
    });
    expect(client.getQueryData(eventKeys.detail(options, event.id))).toEqual({
      ...event,
      name: "Canonical title",
      version: 3,
    });
    expect(client.getQueryData(foreign)).toBe(event);
    fetch.mockImplementation(async () => response({ error: "EVENT_CHANGED" }, 409));
    for (const op of [
      () => h.result.current.create.mutateAsync({ organizationId: "org", input }),
      () =>
        h.result.current.update.mutateAsync({
          id: event.id,
          input: { ...input, version: 2, removedTableIds: [] },
        }),
      () => h.result.current.cancel.mutateAsync(event.id),
      () => h.result.current.request.mutateAsync({ eventId: event.id, tableId: table.id }),
      () =>
        h.result.current.invite.mutateAsync({
          eventId: event.id,
          tableId: table.id,
          userId: "guest",
        }),
    ])
      await act(async () => {
        await expect(op()).rejects.toThrow();
      });
    expect(client.getQueryData(foreign)).toBe(event);
    expect(client.getQueryData(listKey)).toEqual({
      pages: [{ items: [{ ...event, name: "Canonical title", version: 3 }], nextCursor: null }],
      pageParams: [""],
    });
    expect(options.feedback?.onError).toHaveBeenCalledTimes(5);
    fetch.mockImplementation(async () => response(booking));
    await act(async () => {
      await h.result.current.request.mutateAsync({ eventId: event.id, tableId: table.id });
      await h.result.current.invite.mutateAsync({
        eventId: event.id,
        tableId: table.id,
        userId: "guest",
      });
      await h.result.current.cancel.mutateAsync(event.id);
    });
    expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
  });
  it("refetches only affected active event data and marks only owning match caches stale", async () => {
    const { client, wrapper } = setup();
    const other = { ...event, id: "unrelated", organizationId: "other-org" };
    let server = event;
    client.setQueryData(eventKeys.tables(options, event.id, ""), {
      pages: [{ items: [table], nextCursor: null }],
      pageParams: [""],
    });
    for (const key of [
      ["matches", "detail", "owned", options.apiUrl, "user"],
      ["matches", "detail", "foreign", options.apiUrl, "other"],
      ["matches", "detail", "foreign-api", "https://other.example.test", "user"],
      ["unrelated"],
    ])
      client.setQueryData(key, { existing: true });
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === "PATCH") {
        server = { ...event, name: "Authoritative", version: 3 };
        return response(server);
      }
      if (init.method === "DELETE") return response({ success: true });
      return response({
        items: url.includes("other-org") ? [other] : [server, other],
        nextCursor: null,
      });
    });
    vi.stubGlobal("fetch", fetch);
    const h = renderHook(
      () => ({
        main: useEventList(options),
        unrelated: useEventList(options, "other-org"),
        actions: useEventActions(options),
      }),
      { wrapper },
    );
    await waitFor(() => expect(h.result.current.main.items).toHaveLength(2));
    await waitFor(() => expect(h.result.current.unrelated.items).toHaveLength(1));
    const unrelatedReads = fetch.mock.calls.filter(([url]) => url.includes("other-org")).length;
    await act(async () => {
      await h.result.current.actions.update.mutateAsync({
        id: event.id,
        input: { ...input, name: "Edit", version: 2, removedTableIds: [] },
      });
    });
    expect(fetch.mock.calls.filter(([url]) => url.includes("other-org"))).toHaveLength(
      unrelatedReads,
    );
    expect(
      client.getQueryState(["matches", "detail", "owned", options.apiUrl, "user"])?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(["matches", "detail", "foreign", options.apiUrl, "other"])
        ?.isInvalidated,
    ).toBe(false);
    expect(
      client.getQueryState([
        "matches",
        "detail",
        "foreign-api",
        "https://other.example.test",
        "user",
      ])?.isInvalidated,
    ).toBe(false);
    await waitFor(() => expect(h.result.current.main.items[0].name).toBe("Authoritative"));
    await act(async () => {
      await h.result.current.actions.cancel.mutateAsync(event.id);
    });
  });
  it("does not overwrite unrelated updates during rollback and handles optional feedback and cancellation failures", async () => {
    const { client, wrapper } = setup();
    const key = eventKeys.detail(options, event.id),
      otherKey = eventKeys.detail(options, "unrelated");
    client.setQueryData(key, event);
    client.setQueryData(otherKey, { ...event, id: "unrelated", version: 7 });
    const noFeedback = { ...options, feedback: undefined };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ error: "EVENT_CHANGED" }, 409)),
    );
    const h = renderHook(() => useEventActions(noFeedback), { wrapper });
    await act(async () => {
      await expect(
        h.result.current.update.mutateAsync({
          id: event.id,
          input: { ...input, version: 2, removedTableIds: [] },
        }),
      ).rejects.toThrow();
    });
    expect(client.getQueryData<EventResponse>(otherKey)?.version).toBe(7);
    const cancel = vi
      .spyOn(client, "cancelQueries")
      .mockRejectedValueOnce(new Error("cancel failed"));
    const withFeedback = renderHook(() => useEventActions(options), { wrapper });
    await act(async () => {
      await expect(withFeedback.result.current.cancel.mutateAsync(event.id)).rejects.toThrow(
        "cancel failed",
      );
    });
    expect(cancel).toHaveBeenCalled();
    expect(options.feedback?.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "cancel failed" }),
      "cancel_event",
    );
  });
});
