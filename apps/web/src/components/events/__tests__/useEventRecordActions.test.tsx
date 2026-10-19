import {
  eventRecordKeys,
  eventRecordsQuery,
  recordTablesQuery,
  useEventRecordActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable, seat, tableId } from "@/test-fixtures/eventRecords";

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
it("reserves an action without inventing capacity/priority, reconciles self versus invited registration and preserves permissions", async () => {
  const { client, options, wrapper } = setup(),
    registration = seat("owner");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(registration))),
  );
  const q = renderHook(() => useEventRecordActions(options, eventId), { wrapper });
  await act(async () => {
    await q.result.current.register.mutateAsync(tableId);
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
          input: { action, version: registration.version },
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
