import {
  createPlannedEventSchema,
  type EventParticipantResponse,
  type NotificationAttentionSnapshot,
  notificationItemId,
  type PlannedEventResponse,
  type PlannedTableResponse,
  type SaveTableResultResponse,
  type TableSeatOrderSnapshot,
  type TableSeatResponse,
  tableRegistrationReceiptSchema,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  emptyAttentionSummary,
  eventParticipantsQuery,
  eventProposalKeys,
  eventRecordKeys,
  eventRecordsQuery,
  groupRecordKeys,
  notificationAttentionQuery,
  useEventRecordActions,
  useTableSeats,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  eventId,
  groupRecord,
  optionId,
  plannedEvent,
  plannedTable,
  seat,
  tableId,
} from "@/test-fixtures/eventRecords";

const API = "https://event-action-receipts.test";
const clients: QueryClient[] = [];
const page = <T,>(items: T[]) => ({ pages: [{ items, nextCursor: null }], pageParams: [""] });
function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const options = {
    apiUrl: API,
    userId: "owner",
    getToken: vi.fn(async () => "current-token"),
    feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  client.setQueryData(eventRecordKeys.detail(options, eventId), plannedEvent);
  client.setQueryData(eventRecordKeys.table(options, eventId, tableId), plannedTable);
  return { client, options, wrapper };
}
function rows<T>(client: QueryClient, key: QueryKey) {
  return client.getQueryData<{ pages: { items: T[] }[] }>(key)?.pages.flatMap((p) => p.items) ?? [];
}
function transport(
  reply: (url: URL, method: string, body: Record<string, unknown>) => Promise<Response>,
) {
  const calls: { url: URL; method: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer current-token");
      const method = init?.method ?? "GET",
        body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, method, body });
      return reply(url, method, body);
    }),
  );
  return calls;
}
const createInput = () =>
  createPlannedEventSchema.parse({
    groupId: groupRecord.id,
    name: "Created event",
    timeZone: plannedEvent.timeZone,
    startTime: plannedEvent.startTime,
    dates: plannedEvent.dates,
    locations: plannedEvent.locations,
    tables: [
      {
        name: "First table",
        minPlayers: 2,
        maxPlayers: 4,
        rankingEnabled: false,
        games: [{ gameId: 1, manualDurationMinutes: 60 }],
      },
    ],
  });
afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const client of clients.splice(0)) clearSessionQueryCache(client);
  });
  vi.unstubAllGlobals();
});

it.each(["identity", "role", "invite", "edit"] as const)(
  "revalidates the parent %s authority before sending any event creation",
  async (reason) => {
    const { client, options, wrapper } = setup();
    const foreign = groupRecordKeys.detail({ ...options, userId: "foreign" }, groupRecord.id);
    client.setQueryData(foreign, groupRecord);
    const parent = {
      ...groupRecord,
      ...(reason === "identity"
        ? { id: tableId }
        : reason === "role"
          ? { role: "accepted" as const }
          : reason === "invite"
            ? { canInvite: false }
            : { canEdit: false }),
    };
    const calls = transport(async (url, method) => {
      if (url.pathname === `/api/groups/${groupRecord.id}` && method === "GET")
        return Response.json(parent);
      throw new Error("Unverified group authority must never dispatch an event POST");
    });
    const hook = renderHook(() => useEventRecordActions(options, ""), { wrapper });
    act(() => hook.result.current.create.mutate(createInput()));
    await waitFor(() => expect(hook.result.current.create.isError).toBe(true));
    expect(calls.every(({ method }) => method === "GET")).toBe(true);
    if (reason === "role") {
      // The canonical group read revokes the dependent intent before its explicit capability check.
      expect(hook.result.current.create.error?.message).toBe("MUTATION_OWNER_CHANGED");
      expect(options.feedback.onError).not.toHaveBeenCalled();
    } else {
      expect(hook.result.current.create.error).toMatchObject({
        status: 403,
        message: "GROUP_ADMIN_REQUIRED",
      });
      expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "create_event");
    }
    expect(options.feedback.onSuccess).not.toHaveBeenCalled();
    expect(client.isMutating()).toBe(0);
    expect(client.getQueryData(foreign)).toEqual(groupRecord);
  },
);

it.each([401, 403])(
  "discards a created detail when its mandatory canonical read revokes access with %s",
  async (status) => {
    const { client, options, wrapper } = setup();
    const created = { ...plannedEvent, id: optionId, name: "Created event", groupId: null };
    const calls = transport(async (url, method, body) => {
      if (url.pathname === "/api/events" && method === "POST")
        return Response.json({ ...created, clientRequestId: body.clientRequestId });
      if (url.pathname === "/api/events" && method === "GET")
        return Response.json({ error: "ACCESS_REVOKED" }, { status });
      throw new Error(`Unexpected creation read ${url}`);
    });
    const hook = renderHook(() => useEventRecordActions(options, ""), { wrapper });
    act(() => hook.result.current.create.mutate({ ...createInput(), groupId: null }));
    await waitFor(() =>
      expect(options.feedback.onError).toHaveBeenCalledWith(
        expect.any(Error),
        "refresh_saved_changes",
      ),
    );
    expect(client.getQueryData(eventRecordKeys.detail(options, created.id))).toBeUndefined();
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
    expect(hook.result.current.blocking).toBe(false);
  },
);

it("an older update receipt preserves a newer canonical detail and revokes only owned proposal-review capability", async () => {
  const { client, options, wrapper } = setup();
  const fresh = { ...plannedEvent, version: 5, name: "Newest server event", canManage: false };
  client.setQueryData(eventRecordKeys.detail(options, eventId), fresh);
  const listKey = eventRecordsQuery(options).queryKey;
  client.setQueryData(listKey, page([fresh]));
  const scope = { eventId, groupId: null, mode: "review" as const, kind: "date" as const };
  const review = eventProposalKeys.page(options, scope);
  const foreignReview = eventProposalKeys.page({ ...options, userId: "foreign" }, scope);
  const reviewData = {
    pages: [
      { eventId, eventVersion: 5, groupId: null, mode: "review", items: [], nextCursor: null },
    ],
    pageParams: [""],
  };
  for (const key of [review, foreignReview]) client.setQueryData(key, reviewData);
  transport(async (_url, method) => {
    expect(method).toBe("PATCH");
    return Response.json({ ...plannedEvent, version: 2, name: "Older receipt", canManage: false });
  });
  const hook = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  await act(async () => {
    await hook.result.current.update.mutateAsync({
      name: "Edited draft",
      timeZone: plannedEvent.timeZone,
      startTime: plannedEvent.startTime,
      dates: plannedEvent.dates,
      locations: plannedEvent.locations,
      version: 1,
      tables: [],
      removedTableIds: [],
    });
  });
  expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
    version: 5,
    name: "Newest server event",
  });
  expect(rows<PlannedEventResponse>(client, listKey)[0]).toMatchObject({
    version: 5,
    name: "Newest server event",
  });
  expect(client.getQueryData(review)).toBeUndefined();
  expect(client.getQueryData(foreignReview)).toEqual(reviewData);
});

it.each(["owner", "guest"] as const)(
  "removes %s attendance across canonical participant/seat/detail projections without touching foreign owners",
  async (target) => {
    const { client, options, wrapper } = setup();
    const registration = { ...seat(target), kind: "SELF" as const };
    const other = { ...seat("other"), id: tableId };
    const initial: PlannedEventResponse = {
      ...plannedEvent,
      participantCount: 2,
      canVote: true,
      myRegistrations: target === "owner" ? [registration] : [],
    };
    const table: PlannedTableResponse = {
      ...plannedTable,
      myRegistration: target === "owner" ? registration : null,
      myPosition: target === "owner" ? "SEATED" : null,
      canLeave: target === "owner",
    };
    const seats = [...eventRecordKeys.root(options), "seats", eventId, tableId, false, ""];
    const people = eventParticipantsQuery(options, eventId, {
      mode: "review",
      groupId: null,
    }).queryKey;
    const person = (userId: string): EventParticipantResponse => ({
      id: userId,
      userId,
      name: userId,
      username: userId,
      avatarUrl: null,
      position: "SEATED",
      accepted: true,
      canRemove: true,
      canBanGroup: false,
    });
    const tableKey = eventRecordKeys.table(options, eventId, tableId),
      foreignKey = eventRecordKeys.table({ ...options, userId: "foreign" }, eventId, tableId);
    client.setQueryData(eventRecordKeys.detail(options, eventId), initial);
    client.setQueryData(tableKey, table);
    client.setQueryData(foreignKey, table);
    client.setQueryData(seats, page([registration, other]));
    client.setQueryData(people, {
      pages: [
        {
          items: [person(target), person("other")],
          nextCursor: null,
          eventVersion: 1,
          groupId: null,
          status: "PLANNING",
        },
      ],
      pageParams: [""],
    });
    let finish: (response: Response) => void = () => {};
    const calls = transport(async (url, method, body) => {
      expect(url.pathname).toBe(`/api/events/${eventId}/participants/${target}`);
      expect(method).toBe("DELETE");
      expect(body).toEqual({ version: 1 });
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const hook = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    act(() => hook.result.current.removeParticipant.mutate({ version: 1, userId: target }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(rows<TableSeatResponse>(client, seats).map((row) => row.userId)).toEqual(["other"]);
    expect(rows<EventParticipantResponse>(client, people).map((row) => row.userId)).toEqual([
      "other",
    ]);
    const saved = {
      ...initial,
      version: 2,
      participantCount: 1,
      canVote: target !== "owner",
      myRegistrations: [],
    };
    await act(() => finish(Response.json(saved)));
    await waitFor(() => expect(hook.result.current.removeParticipant.isSuccess).toBe(true));
    expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
      version: 2,
      participantCount: 1,
    });
    if (target === "owner")
      expect(client.getQueryData(tableKey)).toMatchObject({
        myRegistration: null,
        myPosition: null,
      });
    expect(client.getQueryData(foreignKey)).toEqual(table);
  },
);

it.each([false, true])(
  "a reordered own waiting place respects existing newer registration metadata=%s",
  async (newer) => {
    const { client, options, wrapper } = setup();
    const own = { ...seat("owner", newer ? 4 : 1), seatIndex: 0, locked: true };
    const guest = { ...seat("guest"), id: tableId, seatIndex: 1 };
    const untouched = { ...seat("third"), id: eventId, seatIndex: 3 };
    const before = {
      ...plannedTable,
      eventVersion: 1,
      myRegistration: own,
      myPosition: "SEATED" as const,
      canProposeGames: true,
    };
    const key = eventRecordKeys.table(options, eventId, tableId);
    client.setQueryData(key, before);
    const seatsKey = [...eventRecordKeys.root(options), "seats", eventId, tableId, false, ""];
    client.setQueryData(seatsKey, page([own, guest, untouched]));
    const snapshot: TableSeatOrderSnapshot = {
      version: 2,
      allocationKey: "b".repeat(64),
      capacity: 4,
      seatedCount: 1,
      registrations: [
        { ...own, version: 2, locked: false, seatIndex: null },
        { ...guest, version: 2, seatIndex: 2 },
      ],
    };
    transport(async (_url, method) => {
      expect(method).toBe("PATCH");
      return Response.json(snapshot);
    });
    const hook = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    await act(async () => {
      await hook.result.current.reorderSeats.mutateAsync({
        tableId,
        input: {
          version: 1,
          allocationKey: "a".repeat(64),
          registrations: [
            { id: own.id, version: own.version, locked: false, seatIndex: null },
            { id: guest.id, version: 1, locked: false, seatIndex: 2 },
          ],
        },
      });
    });
    if (newer)
      expect(client.getQueryData(key)).toMatchObject({
        eventVersion: 1,
        myPosition: "SEATED",
        myRegistration: { version: 4 },
        canProposeGames: true,
      });
    else
      expect(client.getQueryData(key)).toMatchObject({
        eventVersion: 2,
        myPosition: "WAITING",
        myRegistration: { version: 2, seatIndex: null },
        canProposeGames: false,
        occupiedSeatIndices: [2],
        seatedCount: 1,
        waitingCount: 1,
      });
    expect(rows<TableSeatResponse>(client, seatsKey).find((row) => row.userId === "third")).toEqual(
      untouched,
    );
  },
);

it.each(["event", "table"] as const)(
  "an older allocation snapshot cannot overwrite a newer %s epoch",
  async (where) => {
    const { client, options, wrapper } = setup();
    const own = { ...seat("owner"), seatIndex: 0, locked: true };
    const current = {
      ...plannedTable,
      eventVersion: where === "table" ? 5 : 1,
      myRegistration: own,
      myPosition: "SEATED" as const,
    };
    const key = eventRecordKeys.table(options, eventId, tableId);
    client.setQueryData(key, current);
    client.setQueryData(eventRecordKeys.detail(options, eventId), {
      ...plannedEvent,
      version: where === "event" ? 5 : 1,
    });
    transport(async () =>
      Response.json({
        version: 2,
        allocationKey: "b".repeat(64),
        capacity: 4,
        seatedCount: 0,
        registrations: [{ ...own, seatIndex: null, locked: false, version: 2 }],
      } satisfies TableSeatOrderSnapshot),
    );
    const hook = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    await act(async () => {
      await hook.result.current.reorderSeats.mutateAsync({
        tableId,
        input: {
          version: 1,
          allocationKey: "a".repeat(64),
          registrations: [{ id: own.id, version: 1, locked: false, seatIndex: null }],
        },
      });
    });
    expect(client.getQueryData(key)).toEqual(current);
  },
);

it.each(["epoch", "timestamp"] as const)(
  "result receipts do not overwrite newer table %s or unrelated list rows",
  async (newer) => {
    const { client, options, wrapper } = setup();
    const original = {
      ...plannedTable,
      eventStatus: "CONFIRMED" as const,
      eventVersion: newer === "epoch" ? 5 : 1,
      updatedAt: "2030-06-09T10:00:00.000Z",
      resultDraft: { lowerWins: true, entries: [{ userId: "owner", score: "9" }], tieBreaks: [] },
    };
    const unrelated = { ...plannedTable, id: optionId, name: "Different table" };
    const listKey = eventRecordKeys.tables(options, eventId),
      detailKey = eventRecordKeys.table(options, eventId, tableId);
    client.setQueryData(detailKey, original);
    client.setQueryData(listKey, page([original, unrelated]));
    const value: SaveTableResultResponse = {
      event: { ...plannedEvent, status: "CONFIRMED", version: 2 },
      table: {
        ...plannedTable,
        eventStatus: "CONFIRMED",
        eventVersion: 2,
        updatedAt: "2030-06-02T10:00:00.000Z",
        resultDraft: {
          lowerWins: false,
          entries: [{ userId: "owner", score: "2" }],
          tieBreaks: [],
        },
      },
    };
    transport(async (_url, method) => {
      expect(method).toBe("PUT");
      return Response.json(value);
    });
    const hook = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    await act(async () => {
      await hook.result.current.saveResult.mutateAsync({
        tableId,
        input: {
          version: 1,
          lowerWins: false,
          entries: [{ userId: "owner", score: "2" }],
          tieBreaks: [],
        },
      });
    });
    expect(client.getQueryData(detailKey)).toEqual(original);
    expect(rows<PlannedTableResponse>(client, listKey)).toEqual([original, unrelated]);
  },
);

it.each(["event", "table", "parent", "epoch"] as const)(
  "unverifiable %s result receipts retain a read barrier instead of installing a foreign result",
  async (invalid) => {
    const { client, options, wrapper } = setup();
    const key = eventRecordKeys.table(options, eventId, tableId);
    const value: SaveTableResultResponse = {
      event: { ...plannedEvent, id: invalid === "event" ? optionId : eventId, version: 2 },
      table: {
        ...plannedTable,
        id: invalid === "table" ? optionId : tableId,
        eventId: invalid === "parent" ? optionId : eventId,
        eventVersion: invalid === "epoch" ? 7 : 2,
      },
    };
    const calls = transport(async (_url, method) => {
      expect(method).toBe("PUT");
      return Response.json(value);
    });
    const hook = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    act(() =>
      hook.result.current.saveResult.mutate({
        tableId,
        input: {
          version: 1,
          lowerWins: false,
          entries: [{ userId: "owner", score: "2" }],
          tieBreaks: [],
        },
      }),
    );
    await waitFor(() =>
      expect(options.feedback.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "MUTATION_READ_UNVERIFIED" }),
        "verify_saved_changes",
      ),
    );
    expect(client.getQueryData<PlannedTableResponse>(key)?.eventVersion).not.toBe(
      value.table.eventVersion,
    );
    expect(client.getQueryData<PlannedTableResponse>(key)?.id).toBe(tableId);
    expect(
      client.getQueryData<PlannedEventResponse>(eventRecordKeys.detail(options, eventId))?.version,
    ).toBe(1);
    // Seed-only caches have no authoritative readers: recovery cannot verify this write.
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(hook.result.current.blocking).toBe(true);
    expect(hook.result.current.saveResult.isPending).toBe(true);
    expect(options.feedback.onSuccess).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  },
);

it("coalesces an already-pending registration response and never acknowledges a duplicate removal", async () => {
  const { client, options, wrapper } = setup();
  const guest = seat("guest");
  let release: (response: Response) => void = () => {};
  const calls = transport(async (_url, method) =>
    method === "PATCH"
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Response.json({ ...plannedEvent, version: 2 }),
  );
  const hook = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  const input = {
    registrationId: guest.id,
    tableId,
    person: guest,
    input: { action: "remove" as const, version: 1 },
  };
  act(() => hook.result.current.respond.mutate(input));
  await waitFor(() => expect(calls.filter(({ method }) => method === "PATCH")).toHaveLength(1));
  act(() => hook.result.current.respond.mutate(input));
  await waitFor(() =>
    expect(hook.result.current.respond.error?.message).toBe("MUTATION_IN_PROGRESS"),
  );
  expect(calls.filter(({ method }) => method === "PATCH")).toHaveLength(1);
  await act(() =>
    release(Response.json({ ...guest, version: 2, status: "CANCELLED", eventVersion: 2 })),
  );
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(calls.filter(({ method }) => method === "PATCH")[0].body).toEqual({
    action: "remove",
    version: 1,
  });
});

it.each(["CANCELLED", "DECLINED"] as const)(
  "a queued re-invitation requires a verified CANCELLED predecessor, received %s",
  async (removedStatus) => {
    const { options, wrapper } = setup();
    const guest = seat("guest");
    // Atomic write receipts contain registration fields, not roster display/profile fields.
    const removalReceipt = tableRegistrationReceiptSchema.parse({
      id: guest.id,
      eventId,
      tableId,
      userId: guest.userId,
      kind: guest.kind,
      status: removedStatus,
      priorityAt: guest.priorityAt,
      sequence: guest.sequence,
      version: 2,
      gameVotes: guest.gameVotes,
      createdAt: guest.createdAt,
      updatedAt: guest.updatedAt,
      eventVersion: 2,
    });
    let epoch = 1,
      release: (response: Response) => void = () => {};
    const calls = transport(async (url, method) => {
      if (method === "PATCH")
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      if (method === "POST") {
        epoch = 3;
        return Response.json(
          tableRegistrationReceiptSchema.parse({
            ...removalReceipt,
            id: tableId,
            status: "PENDING",
            version: 1,
            eventVersion: epoch,
          }),
        );
      }
      if (url.pathname === `/api/events/${eventId}`)
        return Response.json({ ...plannedEvent, version: epoch });
      throw new Error(`Unexpected reinvite receipt read ${url}`);
    });
    const hook = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    act(() =>
      hook.result.current.respond.mutate({
        registrationId: guest.id,
        tableId,
        person: guest,
        input: { action: "remove", version: 1 },
      }),
    );
    await waitFor(() => expect(calls.filter(({ method }) => method === "PATCH")).toHaveLength(1));
    act(() => hook.result.current.invite.mutate({ tableId, userId: "guest" }));
    await waitFor(() => expect(hook.result.current.isInviting(tableId, "guest")).toBe(true));
    expect(calls.some(({ method }) => method === "POST")).toBe(false);
    epoch = 2;
    await act(() => release(Response.json(removalReceipt)));
    await waitFor(() =>
      expect(
        removedStatus === "CANCELLED"
          ? hook.result.current.invite.isSuccess
          : hook.result.current.invite.isError,
      ).toBe(true),
    );
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(
      removedStatus === "CANCELLED" ? 1 : 0,
    );
    expect(hook.result.current.respond.isSuccess).toBe(true);
    expect(hook.result.current.respond.data).toEqual(removalReceipt);
    if (removedStatus === "DECLINED")
      expect(hook.result.current.invite.error).toMatchObject({
        status: 409,
        message: "EVENT_CHANGED",
      });
    else {
      expect(hook.result.current.invite.data).toMatchObject({
        userId: guest.userId,
        status: "PENDING",
        eventVersion: 3,
      });
      expect(calls.find(({ method }) => method === "POST")?.body).toEqual({ userId: "guest" });
    }
  },
);

it.each(["http", "transport"] as const)(
  "a failed mandatory roster %s read preserves the acknowledged seat and exposes refresh failure",
  async (failure) => {
    const { client, options, wrapper } = setup();
    const own = { ...seat("owner"), kind: "SELF" as const };
    const rosterKey = [...eventRecordKeys.root(options), "seats", eventId, tableId, false, ""];
    client.setQueryData(rosterKey, page([]));
    const calls = transport(async (url, method) => {
      if (method === "POST") return Response.json({ ...own, eventVersion: 2 });
      if (url.pathname.endsWith("/seats"))
        return failure === "http"
          ? Response.json({ error: "ROSTER_UNAVAILABLE" }, { status: 503 })
          : Promise.reject("roster transport disconnected");
      if (url.pathname === `/api/events/${eventId}`)
        return Response.json({ ...plannedEvent, version: 2, myRegistrations: [own] });
      throw new Error(`Unexpected registration refresh ${url}`);
    });
    const hook = renderHook(
      () => ({
        actions: useEventRecordActions(options, eventId),
        roster: useTableSeats(options, eventId, tableId),
      }),
      { wrapper },
    );
    act(() => hook.result.current.actions.register.mutate({ tableId, version: 1, gameVotes: {} }));
    await waitFor(() =>
      expect(options.feedback.onError).toHaveBeenCalledWith(
        expect.any(Error),
        "refresh_saved_changes",
      ),
    );
    expect(
      client.getQueryData<PlannedTableResponse>(eventRecordKeys.table(options, eventId, tableId))
        ?.myRegistration,
    ).toMatchObject({ userId: "owner", status: "ACCEPTED" });
    expect(hook.result.current.actions.blocking).toBe(false);
    expect(hook.result.current.actions.register.isPending).toBe(true);
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
    expect(calls.some(({ url }) => url.pathname.endsWith("/seats"))).toBe(true);
  },
);

it.each([200, 409])(
  "acknowledges a captured table invitation only through its own response (HTTP %s)",
  async (status) => {
    const { client, options, wrapper } = setup();
    const own = { ...seat("owner"), status: "PENDING" as const, kind: "INVITATION" as const };
    const invited = {
      ...plannedEvent,
      adminUserId: "organizer",
      role: "invited" as const,
      canEdit: false,
      canInvite: false,
      myRegistrations: [own],
    };
    client.setQueryData(eventRecordKeys.detail(options, eventId), invited);
    client.setQueryData(eventRecordKeys.table(options, eventId, tableId), {
      ...plannedTable,
      adminUserId: "organizer",
      canRespond: true,
      canRegister: false,
      canInvite: false,
      myRegistration: own,
      myPosition: "SEATED",
    });
    const target = {
      kind: "item" as const,
      id: notificationItemId(tableId, "invitation", undefined, "table"),
    };
    const summary = { ...emptyAttentionSummary(), tables: 1, events: 1 };
    const source: NotificationAttentionSnapshot = {
      asOf: "2030-06-01T10:00:00.000Z",
      summary,
      unreadCount: 1,
      targets: [
        {
          target,
          count: 1,
          direct: 1,
          events: 0,
          sections: summary.sections,
          readEffect: {
            unread: 1,
            summary: { ...summary },
            targets: [{ target, count: 1, direct: 1, events: 0 }],
          },
        },
      ],
    };
    const attention = notificationAttentionQuery(options, [target]).queryKey;
    const unrelated = notificationAttentionQuery({ ...options, userId: "another" }, [
      target,
    ]).queryKey;
    for (const key of [attention, unrelated]) client.setQueryData(key, source);
    const network = Promise.withResolvers<Response>();
    const calls = transport(async (url, method) => {
      if (method === "PATCH") return network.promise;
      expect(url.pathname).toBe(`/api/events/${eventId}`);
      return Response.json({ ...invited, version: 2, myRegistrations: [] });
    });
    const { result } = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    act(() =>
      result.current.respond.mutate({
        tableId,
        registrationId: own.id,
        input: { action: "decline", version: 1 },
      }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].body).toEqual({ action: "decline", version: 1, attentionThrough: source.asOf });
    expect(client.getQueryData(attention)).toMatchObject({ unreadCount: 0 });
    expect(client.getQueryData(unrelated)).toEqual(source);
    const receipt = { ...own, version: 2, status: "DECLINED", eventVersion: 2 };
    await act(async () =>
      network.resolve(status === 200 ? Response.json(receipt) : Response.json({}, { status })),
    );
    await waitFor(() =>
      expect(
        status === 200 ? result.current.respond.isSuccess : result.current.respond.isError,
      ).toBe(true),
    );
    expect(client.getQueryData(attention)).toMatchObject({ unreadCount: status === 200 ? 0 : 1 });
    expect(client.getQueryData(unrelated)).toEqual(source);
    expect(calls.filter(({ method }) => method === "PATCH")).toHaveLength(1);
  },
);
