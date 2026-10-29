import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  eventRecordKeys,
  eventRecordsQuery,
  useEventRecordActions,
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

function setup() {
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
    options = {
      apiUrl: "https://api.test",
      userId: "owner",
      getToken: vi.fn(async () => "fresh"),
      feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() },
    };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  client.setQueryData(eventRecordKeys.detail(options, eventId), plannedEvent);
  client.setQueryData(eventRecordKeys.table(options, eventId, tableId), plannedTable);
  return { client, options, wrapper };
}
afterEach(() => vi.unstubAllGlobals());
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
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(response))),
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
  await act(async () => {
    await q.result.current.respond.mutateAsync({
      registrationId: response.id,
      input: { action: "cancel", version: 3 },
    });
  });
  expect(owned().myRegistrations).toEqual([other]);
  response = { ...seat("guest"), status: "PENDING" };
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
    vi.fn(async () => new Response(JSON.stringify(seat("owner")))),
  );
  const actions = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  const availability = {
    version: 1,
    dateVotes: { [optionId]: "IF_NEEDED" as const },
    locationVotes: { [optionId]: "YES" as const },
  };
  await act(async () => {
    await actions.result.current.register.mutateAsync({
      tableId,
      version: 1,
      gameVotes: { "1": "YES" },
      availability,
    });
  });
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
    foreign = { ...options, userId: "foreign" },
    fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ...plannedEvent, name: "Edited", version: 2 })),
    );
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
  expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
    name: "Edited",
    version: 2,
  });
  expect(client.getQueryData(eventRecordKeys.detail(foreign, eventId))).toMatchObject({
    name: "Friday games",
  });
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
  client.setQueryData(eventRecordKeys.detail(options, eventId), {
    ...plannedEvent,
    name: "Newer",
    version: 5,
  });
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
    registration = seat("owner");
  client.setQueryData(eventRecordKeys.table(options, eventId, tableId), {
    ...plannedTable,
    myRegistration: registration,
  });
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(plannedEvent)),
  );
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
    registration = seat("owner");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(registration))),
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
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ...plannedEvent,
              status: action === "confirm" ? "CONFIRMED" : "PLANNING",
              version: 2,
            }),
          ),
      ),
    );
    const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
    await act(async () => {
      await q.result.current.transition.mutateAsync({ action, version: 1 });
    });
    expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
      version: 2,
    });
    expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith(
      action === "confirm" ? "confirm_event" : "replan_event",
    );
  },
);
it("finalizes only explicit caller-supplied whole-event inputs and writes server results, not invented deltas", async () => {
  const { client, options, wrapper } = setup(),
    fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ ...plannedEvent, status: "TERMINATED", version: 2 })),
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
  await act(async () => {
    await q.result.current.finalize.mutateAsync(input);
  });
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual(input);
  expect(client.getQueryData(eventRecordKeys.detail(options, eventId))).toMatchObject({
    status: "TERMINATED",
  });
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("finalize_event");
});
