import type { ChangeEventVoteInput, PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventRecordKeys,
  eventRecordsQuery,
  useEventRecordActions,
  useEventTableRoster,
  useRecordTable,
  useRecordTables,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  eventId,
  optionId,
  plannedEvent,
  plannedTable,
  seat,
  tableId,
} from "@/test-fixtures/eventRecords";
import { updateOptimisticBase } from "../../../../../../packages/shared/src/common/optimisticOperation";

const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
    options = {
      apiUrl: "https://api.test",
      userId: "owner",
      getToken: vi.fn(async () => "fresh"),
      feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
    };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  clients.push(client);
  client.setQueryData(eventRecordKeys.detail(options, eventId), plannedEvent);
  client.setQueryData(eventRecordKeys.table(options, eventId, tableId), plannedTable);
  return { client, options, wrapper };
}
afterEach(async () => {
  await act(async () => {
    for (const client of clients.splice(0)) clearSessionQueryCache(client);
  });
  vi.unstubAllGlobals();
});
it.each([
  ["invite", true],
  ["invite", false],
  ["remove", true],
  ["remove", false],
] as const)(
  "reconciles invitation rows and Table-list counts after %s with metadata first=%s",
  async (action, metadataFirst) => {
    const { client, options, wrapper } = setup();
    const invitation = { ...seat("guest"), status: "PENDING" as const };
    const before = {
      ...plannedTable,
      pendingCount: action === "remove" ? 1 : 0,
      pendingRegistrationCount: action === "remove" ? 1 : 0,
    };
    const saved = {
      ...plannedTable,
      pendingCount: action === "invite" ? 1 : 0,
      pendingRegistrationCount: action === "invite" ? 1 : 0,
    };
    const rows = action === "invite" ? [invitation] : [];
    const pendingKey = [...eventRecordKeys.root(options), "seats", eventId, tableId, true, ""];
    client.setQueryData(eventRecordKeys.table(options, eventId, tableId), before);
    client.setQueryData(eventRecordKeys.tables(options, null), {
      pages: [{ items: [before], nextCursor: null }],
      pageParams: [""],
    });
    for (const pending of [false, true])
      client.setQueryData(
        [...eventRecordKeys.root(options), "seats", eventId, tableId, pending, ""],
        {
          pages: [{ items: pending && action === "remove" ? [invitation] : [], nextCursor: null }],
          pageParams: [""],
        },
      );
    let releaseEvent!: (response: Response) => void;
    let releaseRoster!: (response: Response) => void;
    let rosterSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") return Response.json(invitation);
        if (init?.method === "PATCH")
          return Response.json({ ...invitation, status: "CANCELLED", version: 2 });
        if (url.endsWith(`/events/${eventId}`))
          return new Promise<Response>((resolve) => {
            releaseEvent = resolve;
          });
        if (url.includes("/seats?")) {
          if (!url.includes("pending=true")) return Response.json({ items: [], nextCursor: null });
          rosterSignal = init?.signal ?? undefined;
          return new Promise<Response>((resolve) => {
            releaseRoster = resolve;
          });
        }
        return url.includes("/api/tables?")
          ? Response.json({ items: [saved], nextCursor: null })
          : Response.json(saved);
      }),
    );
    const hook = renderHook(
      () => {
        const table = useRecordTable(options, eventId, tableId);
        return {
          actions: useEventRecordActions(options, eventId),
          table,
          cards: useRecordTables(options, null),
          roster: useEventTableRoster(options, table.data ?? before),
        };
      },
      { wrapper },
    );
    act(() => {
      if (action === "invite")
        hook.result.current.actions.invite.mutate({ tableId, userId: "guest" });
      else
        hook.result.current.actions.respond.mutate({
          registrationId: invitation.id,
          input: { action: "remove", version: 1 },
        });
    });
    await waitFor(() => {
      expect(releaseRoster).toBeDefined();
      expect(releaseEvent).toBeDefined();
    });
    const mandatoryRosterSignal = rosterSignal;
    expect(hook.result.current.actions.blocking).toBe(false);
    expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith(
      action === "invite" ? "invite_event_player" : "remove_event_player",
    );
    if (!metadataFirst)
      await act(async () => releaseRoster(Response.json({ items: rows, nextCursor: null })));
    await act(async () => releaseEvent(Response.json({ ...plannedEvent, version: 2 })));
    expect(mandatoryRosterSignal?.aborted).toBe(false);
    if (metadataFirst) {
      expect(hook.result.current.actions.busy).toBe(true);
      await act(async () => releaseRoster(Response.json({ items: rows, nextCursor: null })));
    }
    await waitFor(() => expect(hook.result.current.actions.busy).toBe(false));
    expect(mandatoryRosterSignal?.aborted).toBe(false);
    await waitFor(() =>
      expect(hook.result.current.roster.rows.filter((row) => row.kind === "player")).toEqual(
        rows.map((user) => ({ key: user.id, kind: "player", user })),
      ),
    );
    expect(hook.result.current.roster.rows.some((row) => row.kind === "reserved")).toBe(false);
    await waitFor(() => {
      expect(hook.result.current.table.data?.pendingCount).toBe(saved.pendingCount);
      expect(hook.result.current.cards.items[0]?.pendingCount).toBe(saved.pendingCount);
    });
    expect(client.getQueryData(pendingKey)).toMatchObject({ pages: [{ items: rows }] });
    expect(options.feedback.onError).not.toHaveBeenCalled();
    hook.unmount();
    client.clear();
  },
);
it("stages registration feedback before POST and reconciles metadata in background without blocking another Event", async () => {
  const { client, options, wrapper } = setup();
  const registration = { ...seat("owner"), gameVotes: { "1": "YES" as const } };
  let release!: (response: Response) => void;
  let releaseWrite!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          if (init?.method === "POST") releaseWrite = resolve;
          else release = resolve;
        }),
    ),
  );
  const hook = renderHook(
    () => ({
      own: useEventRecordActions(options, eventId),
      other: useEventRecordActions(options, tableId),
    }),
    { wrapper },
  );
  act(() =>
    hook.result.current.own.register.mutate({ tableId, version: 1, gameVotes: { "1": "YES" } }),
  );
  await waitFor(() => expect(releaseWrite).toBeDefined());
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("join_table");
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
  expect(hook.result.current.own.blocking).toBe(false);
  expect(hook.result.current.other.busy).toBe(false);
  expect(client.getQueryData(eventRecordKeys.table(options, eventId, tableId))).toMatchObject({
    myRegistration: null,
    myPosition: null,
    canRegister: false,
  });
  await act(async () => releaseWrite(Response.json(registration)));
  await waitFor(() => expect(release).toBeDefined());
  expect(hook.result.current.own.register.isPending).toBe(true);
  expect(hook.result.current.own.busy).toBe(true);
  expect(hook.result.current.other.busy).toBe(false);
  expect(client.getQueryData(eventRecordKeys.table(options, eventId, tableId))).toMatchObject({
    myRegistration: registration,
    myPosition: null,
    canRegister: false,
    canLeave: false,
  });
  await act(async () => {
    release(Response.json({ ...plannedEvent, version: 2, myRegistrations: [registration] }));
  });
  await waitFor(() => expect(hook.result.current.own.busy).toBe(false));
  expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
    version: 2,
    myRegistrations: [registration],
  });
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(1);
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
  hook.unmount();
  client.clear();
});
it("reconciles owned Event participation from registration responses without depending on refetch or overwriting newer votes", async () => {
  const { client, options, wrapper } = setup(),
    detail = eventRecordKeys.detail(options, eventId),
    list = eventRecordsQuery(options).queryKey;
  const other = { ...seat("owner"), id: eventId, tableId: eventId };
  const initial = { ...plannedEvent, myRegistrations: [other] };
  client.setQueryData(detail, initial);
  client.setQueryData(list, {
    pages: [{ items: [initial, { ...plannedEvent, id: tableId }], nextCursor: null }],
    pageParams: [""],
  });
  const foreign = eventRecordKeys.detail({ ...options, userId: "foreign" }, eventId);
  client.setQueryData(foreign, initial);
  let response = seat("owner");
  let serverEvent: PlannedEventResponse = {
    ...initial,
    version: 2,
    myRegistrations: [other, response],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") return Response.json(serverEvent);
      return new Response(JSON.stringify(response));
    }),
  );
  const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  const owned = () => client.getQueryData<PlannedEventResponse>(detail)!;
  await act(async () => {
    await q.result.current.register.mutateAsync({ tableId, version: 1, gameVotes: { "1": "YES" } });
  });
  expect(owned().myRegistrations).toEqual([other, response]);
  expect(client.getQueryData(list)?.pages[0].items[0].myRegistrations).toEqual([other, response]);
  expect(client.getQueryData(foreign)).toEqual(initial);
  client.setQueryData(detail, {
    ...owned(),
    myRegistrations: [other, { ...response, version: 3 }],
  });
  client.setQueryData(eventRecordKeys.table(options, eventId, tableId), {
    ...plannedTable,
    myRegistration: { ...response, version: 3, gameVotes: { "1": "IF_NEEDED" } },
  });
  serverEvent = {
    ...serverEvent,
    version: 3,
    myRegistrations: [other, { ...response, version: 3, gameVotes: { "1": "IF_NEEDED" } }],
  };
  response = { ...response, version: 2 };
  await act(async () => {
    await q.result.current.respond.mutateAsync({
      registrationId: response.id,
      input: {
        action: "accept",
        version: 1,
        participation: { version: 1, gameVotes: { "1": "YES" } },
      },
    });
  });
  expect(owned().myRegistrations.find((row) => row.tableId === tableId)?.version).toBe(3);
  expect(client.getQueryData(eventRecordKeys.table(options, eventId, tableId))).toMatchObject({
    myRegistration: { version: 3, gameVotes: { "1": "IF_NEEDED" } },
  });
  response = { ...response, status: "CANCELLED", version: 4 };
  serverEvent = { ...serverEvent, version: 4, myRegistrations: [other] };
  await act(async () => {
    await q.result.current.respond.mutateAsync({
      registrationId: response.id,
      input: { action: "cancel", version: 3 },
    });
  });
  expect(owned().myRegistrations).toEqual([other]);
  response = { ...seat("guest"), status: "PENDING" };
  serverEvent = { ...serverEvent, version: 5 };
  await act(async () => {
    await q.result.current.invite.mutateAsync({ tableId, userId: "guest" });
  });
  expect(owned().myRegistrations).toEqual([other]);
});
it("reconciles acknowledged PRIVATE preferences without overwriting newer or foreign Event votes", async () => {
  const { client, options, wrapper } = setup();
  const detail = eventRecordKeys.detail(options, eventId),
    list = eventRecordsQuery(options).queryKey;
  const priorVotes = {
    dateVotes: { [tableId]: "YES" as const },
    locationVotes: { [tableId]: "YES" as const },
  };
  client.setQueryData(detail, { ...plannedEvent, myVotes: priorVotes });
  client.setQueryData(list, {
    pages: [
      {
        items: [
          { ...plannedEvent, version: 9, myVotes: priorVotes },
          { ...plannedEvent, id: tableId, myVotes: priorVotes },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [""],
  });
  const foreign = eventRecordKeys.detail({ ...options, userId: "foreign" }, eventId);
  client.setQueryData(foreign, { ...plannedEvent, myVotes: priorVotes });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") throw new Error("detail refresh unavailable");
      return new Response(JSON.stringify(seat("owner")));
    }),
  );
  const actions = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  const availability = {
    version: 1,
    dateVotes: { [optionId]: "IF_NEEDED" as const },
    locationVotes: { [optionId]: "YES" as const },
  };
  act(() =>
    actions.result.current.register.mutate({
      tableId,
      version: 1,
      gameVotes: { "1": "YES" },
      availability,
    }),
  );
  await waitFor(() =>
    expect(options.feedback.onError).toHaveBeenCalledWith(
      expect.any(Error),
      "refresh_saved_changes",
    ),
  );
  expect(actions.result.current.blocking).toBe(false);
  expect(actions.result.current.register.isPending).toBe(true);
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("join_table");
  expect(client.getQueryData<PlannedEventResponse>(detail)?.myVotes).toEqual({
    dateVotes: availability.dateVotes,
    locationVotes: availability.locationVotes,
  });
  expect(client.getQueryData<PlannedEventResponse>(foreign)?.myVotes).toEqual(priorVotes);
  expect(
    client
      .getQueryData<{ pages: Array<{ items: PlannedEventResponse[] }> }>(list)
      ?.pages[0].items.map((row) => row.myVotes),
  ).toEqual([priorVotes, priorVotes]);
});
it("marks current Table rankings stale after finalization without refetching unrelated inactive or foreign caches", async () => {
  const { client, options, wrapper } = setup();
  const owned = [...eventRecordKeys.root(options), "leaderboard", eventId, tableId, 1];
  const foreign = [
    ...eventRecordKeys.root({ ...options, userId: "foreign" }),
    "leaderboard",
    eventId,
    tableId,
    1,
  ];
  const unrelated = [...eventRecordKeys.root(options), "leaderboard", tableId, eventId, 1];
  for (const key of [owned, foreign, unrelated])
    client.setQueryData(key, {
      pages: [{ gameId: 1, scope: "GLOBAL", items: [], nextCursor: null }],
      pageParams: [""],
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ ...plannedEvent, status: "TERMINATED", version: 2 })),
    ),
  );
  const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  await act(async () => {
    await q.result.current.finalize.mutateAsync({
      version: 1,
      results: [
        {
          tableId,
          lowerWins: false,
          entries: [
            { userId: "owner", score: null },
            { userId: "guest", score: null },
          ],
          tieBreaks: [],
        },
      ],
    });
  });
  expect(client.getQueryState(owned)?.isInvalidated).toBe(true);
  expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
  expect(client.getQueryState(unrelated)?.isInvalidated).toBe(false);
});
it("creates/updates authoritative event records and does not patch foreign API/user caches", async () => {
  const { client, options, wrapper } = setup(),
    foreign = { ...options, userId: "foreign" };
  let saved: PlannedEventResponse = { ...plannedEvent, id: optionId, name: "Edited", version: 1 };
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const input = JSON.parse(String(init.body));
      saved = { ...saved, clientRequestId: input.clientRequestId };
      return Response.json(saved);
    }
    return url.includes("/events?")
      ? Response.json({ items: [saved, plannedEvent], nextCursor: null })
      : Response.json(saved);
  });
  client.setQueryData(eventRecordKeys.detail(foreign, eventId), plannedEvent);
  vi.stubGlobal("fetch", fetch);
  const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  await act(async () => {
    await q.result.current.create.mutateAsync({
      groupId: null,
      name: "Edited",
      timeZone: plannedEvent.timeZone,
      startTime: "20:00",
      dates: plannedEvent.dates,
      locations: plannedEvent.locations,
      tables: [
        { name: "One", minPlayers: 2, maxPlayers: 4, games: [{ gameId: 1 }], rankingEnabled: true },
      ],
    });
  });
  expect(client.getQueryData(eventRecordKeys.detail(options, optionId))).toMatchObject({
    name: "Edited",
    version: 1,
    clientRequestId: expect.any(String),
  });
  expect(saved.clientRequestId).not.toBe(saved.id);
  expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toEqual(plannedEvent);
  expect(client.getQueryData(eventRecordKeys.detail(foreign, eventId))).toMatchObject({
    name: "Friday games",
  });
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("create_event");
});
it("selectively rolls back failed edits while preserving a newer authoritative version", async () => {
  const { client, options, wrapper } = setup();
  let done!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          done = resolve;
        }),
    ),
  );
  const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  let promise!: Promise<unknown>;
  act(() => {
    promise = q.result.current.update
      .mutateAsync({
        name: "Edited",
        version: 1,
        timeZone: plannedEvent.timeZone,
        startTime: "20:00",
        dates: plannedEvent.dates,
        locations: plannedEvent.locations,
        tables: [],
        removedTableIds: [],
      })
      .catch(() => {});
  });
  await waitFor(() => expect(done).toBeDefined());
  expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
    name: "Edited",
  });
  updateOptimisticBase(client, eventRecordKeys.detail(options, eventId), () => ({
    ...plannedEvent,
    name: "Newer",
    version: 5,
  }));
  await act(async () => {
    done(new Response('{"error":"EVENT_CHANGED"}', { status: 409 }));
    await promise;
  });
  expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
    name: "Newer",
    version: 5,
  });
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "update_event");
});
it("updates only owned vote maps and never converts a vote into invitation consent", async () => {
  const { client, options, wrapper } = setup(),
    registration = { ...seat("owner"), gameVotes: { "1": "YES" as const, "2": "YES" as const } };
  client.setQueryData(eventRecordKeys.detail(options, eventId), {
    ...plannedEvent,
    canVote: true,
    myRegistrations: [registration],
  });
  client.setQueryData(eventRecordKeys.table(options, eventId, tableId), {
    ...plannedTable,
    games: [...plannedTable.games, { ...plannedTable.games[0], gameId: 2 }],
    myRegistration: registration,
  });
  let current = {
    ...plannedEvent,
    canVote: true,
    myRegistrations: [registration] as typeof plannedEvent.myRegistrations,
  };
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const input = JSON.parse(String(init?.body)) as ChangeEventVoteInput;
    if (input.kind === "game")
      current = {
        ...current,
        myRegistrations: current.myRegistrations.map((row) => ({
          ...row,
          version: row.version + 1,
          gameVotes: { ...row.gameVotes, [input.gameId]: input.vote },
        })),
      };
    else {
      const field = input.kind === "date" ? "dateVotes" : "locationVotes";
      current = {
        ...current,
        myVotes: {
          dateVotes: { ...current.myVotes?.dateVotes },
          locationVotes: { ...current.myVotes?.locationVotes },
          [field]: { ...current.myVotes?.[field], [input.optionId]: input.vote },
        },
      };
    }
    current = { ...current, version: current.version + 1 };
    return Response.json(current);
  });
  vi.stubGlobal("fetch", fetch);
  const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  for (const input of [
    { kind: "date", optionId: plannedEvent.dates[0].id, vote: "YES" },
    { kind: "location", optionId: plannedEvent.locations[0].id, vote: "IF_NEEDED" },
    { kind: "game", tableId, gameId: 1, vote: "NO" },
  ] as const)
    await act(async () => {
      await q.result.current.vote.mutateAsync(input);
    });
  expect(
    fetch.mock.calls.every(([url, init]) => url.endsWith("/votes") && init?.method === "PATCH"),
  ).toBe(true);
  expect(client.getQueryData(eventRecordKeys.table(options, eventId, tableId))).toMatchObject({
    myRegistration: { status: "ACCEPTED", gameVotes: { "1": "NO" } },
  });
  expect(options.getToken).toHaveBeenCalledTimes(3);
});
it.each(["date", "location", "game"] as const)(
  "optimistically updates %s totals with the owned vote, rolls back failures and preserves foreign caches",
  async (kind) => {
    const { client, options, wrapper } = setup(),
      counts = { YES: 0, NO: 0, IF_NEEDED: 0, UNKNOWN: 1 },
      option = plannedEvent.dates[0].id;
    const detail = {
      ...plannedEvent,
      canVote: true,
      myRegistrations: [seat("owner")],
      voteCounts: { dates: { [option]: counts }, locations: { [option]: counts } },
    };
    const table = {
      ...plannedTable,
      myRegistration: seat("owner"),
      gameVoteCounts: { "1": counts },
    };
    const eventKey = eventRecordKeys.detail(options, eventId),
      tableKey = eventRecordKeys.table(options, eventId, tableId),
      foreignKey = eventRecordKeys.detail({ ...options, userId: "foreign" }, eventId);
    client.setQueryData(eventKey, detail);
    client.setQueryData(tableKey, table);
    client.setQueryData(foreignKey, detail);
    let respond: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            respond = resolve;
          }),
      ),
    );
    const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = q.result.current.vote
        .mutateAsync(
          kind === "game"
            ? { kind, tableId, gameId: 1, vote: "YES" }
            : { kind, optionId: option, vote: "YES" },
        )
        .catch((error) => error);
    });
    await waitFor(() => expect(respond).toBeTypeOf("function"));
    expect(client.getQueryData(kind === "game" ? tableKey : eventKey)).toMatchObject(
      kind === "game"
        ? { gameVoteCounts: { "1": { YES: 1, UNKNOWN: 0 } } }
        : {
            voteCounts: {
              [kind === "date" ? "dates" : "locations"]: { [option]: { YES: 1, UNKNOWN: 0 } },
            },
          },
    );
    expect(client.getQueryData(foreignKey)).toEqual(detail);
    if (!respond) throw new Error("Missing request response");
    const finish = respond;
    await act(async () => {
      finish(new Response('{"code":"EVENT_CLOSED"}', { status: 409 }));
      await pending;
    });
    expect(client.getQueryData(eventKey)).toEqual(detail);
    expect(client.getQueryData(tableKey)).toEqual(table);
    expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "set_event_vote");
  },
);
it("reserves an action without inventing capacity/priority, reconciles self versus invited registration and preserves permissions", async () => {
  const { client, options, wrapper } = setup(),
    registration = { ...seat("owner"), gameVotes: { "1": "YES" as const } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET")
        return Response.json({
          ...plannedEvent,
          canVote: true,
          version: 2,
          myRegistrations: [registration],
        });
      return Response.json(
        url.includes("/invitations") ? { ...seat("guest"), status: "PENDING" } : registration,
      );
    }),
  );
  const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  await act(async () => {
    await q.result.current.register.mutateAsync({ tableId, version: 1, gameVotes: { "1": "YES" } });
  });
  expect(client.getQueryData(eventRecordKeys.table(options, eventId, tableId))).toMatchObject({
    canRegister: false,
    canLeave: false,
    myRegistration: { userId: "owner" },
  });
  await act(async () => {
    await q.result.current.invite.mutateAsync({ tableId, userId: "guest" });
  });
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("join_table");
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("invite_event_player");
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
  expect(client.getQueryData(eventRecordKeys.table(options, eventId, tableId))).toMatchObject({
    myRegistration: { userId: "owner" },
  });
});
it.each(["accept", "decline", "cancel", "remove"] as const)(
  "keeps %s response versioned and rolls failures back including already-cached seats",
  async (action) => {
    const { client, options, wrapper } = setup(),
      registration = seat("owner"),
      key = [...eventRecordKeys.root(options), "seats", eventId, tableId, false, ""];
    client.setQueryData(key, {
      pages: [{ items: [registration], nextCursor: null }],
      pageParams: [""],
    });
    client.setQueryData(eventRecordKeys.table(options, eventId, tableId), {
      ...plannedTable,
      myRegistration: registration,
      canLeave: true,
      canRespond: true,
      myPosition: "SEATED",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"error":"CLOSED"}', { status: 409 })),
    );
    const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    await act(async () => {
      await expect(
        q.result.current.respond.mutateAsync({
          registrationId: registration.id,
          input:
            action === "accept"
              ? {
                  action,
                  version: registration.version,
                  participation: { version: 1, gameVotes: { "1": "YES" } },
                }
              : { action, version: registration.version },
        }),
      ).rejects.toThrow("CLOSED");
    });
    expect(client.getQueryData(eventRecordKeys.table(options, eventId, tableId))).toMatchObject({
      canLeave: true,
      canRespond: true,
      myPosition: "SEATED",
    });
    expect(options.feedback.onError).toHaveBeenCalled();
  },
);
it.each(["confirm", "replan"] as const)(
  "does not fabricate %s agreement/roster before authoritative response",
  async (action) => {
    const { client, options, wrapper } = setup();
    const before: PlannedEventResponse = {
      ...plannedEvent,
      status: action === "confirm" ? "PLANNING" : "CONFIRMED",
      canConfirm: action === "confirm",
      canReplan: action === "replan",
    };
    client.setQueryData(eventRecordKeys.detail(options, eventId), before);
    let release!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    act(() => q.result.current.transition.mutate({ action, version: 1 }));
    await waitFor(() => expect(release).toBeDefined());
    expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith(
      action === "confirm" ? "confirm_event" : "replan_event",
    );
    expect(q.result.current.blocking).toBe(true);
    expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
      status: before.status,
      myRegistrations: before.myRegistrations,
      agreement: before.agreement,
    });
    expect(client.getQueryData(eventRecordKeys.table(options, eventId, tableId))).toEqual(
      plannedTable,
    );
    await act(async () =>
      release(
        Response.json({
          ...plannedEvent,
          status: action === "confirm" ? "CONFIRMED" : "PLANNING",
          version: 2,
        }),
      ),
    );
    await waitFor(() => expect(q.result.current.transition.isSuccess).toBe(true));
    expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
      version: 2,
    });
    expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(1);
    expect(options.feedback.onSuccess).not.toHaveBeenCalled();
  },
);
it("finalizes only explicit caller-supplied whole-event inputs and writes server results, not invented deltas", async () => {
  const { client, options, wrapper } = setup();
  client.setQueryData(eventRecordKeys.detail(options, eventId), {
    ...plannedEvent,
    status: "CONFIRMED",
    canFinalize: true,
  });
  let release!: (response: Response) => void;
  const fetch = vi.fn(
    (_url: string, _init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  const input = {
    version: 1,
    results: [
      {
        tableId,
        lowerWins: false,
        entries: [
          { userId: "owner", score: null },
          { userId: "guest", score: null },
        ],
        tieBreaks: [],
      },
    ],
  };
  act(() => q.result.current.finalize.mutate(input));
  await waitFor(() => expect(release).toBeDefined());
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("finalize_event");
  expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
    status: "CONFIRMED",
    canFinalize: false,
  });
  expect(client.getQueryData(eventRecordKeys.table(options, eventId, tableId))).toEqual(
    plannedTable,
  );
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(input);
  await act(async () =>
    release(Response.json({ ...plannedEvent, status: "TERMINATED", version: 2 })),
  );
  await waitFor(() => expect(q.result.current.finalize.isSuccess).toBe(true));
  expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
    status: "TERMINATED",
  });
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(1);
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
});
