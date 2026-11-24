import type {
  CommunityPageResponse,
  PlannedEventResponse,
  PlannedTableResponse,
  SaveTableResultInput,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventRecordKeys,
  useEventResultsForm,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable, seat, tableId } from "@/test-fixtures/eventRecords";

const api = {
  apiUrl: "https://results-form.test",
  userId: "owner",
  getToken: async () => "fresh",
};
const otherTableId = "44444444-4444-4444-8444-444444444444";
const guestId = "guest:55555555-5555-4555-8555-555555555555";
const date = "2030-06-03T18:00:00Z";
const scores = {
  lowerWins: false,
  entries: [
    { userId: "owner", score: "10" },
    { userId: guestId, score: "20" },
  ],
  tieBreaks: [],
};
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let eventStatus: number;
let roster: TableSeatResponse[];
let pendingRoster: Promise<Response> | undefined;
let pendingWrite: Promise<Response> | undefined;
const writes: { id: string; input: SaveTableResultInput }[] = [];

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function seed() {
  client.setQueryData(eventRecordKeys.detail(api, eventId), event);
  client.setQueryData(eventRecordKeys.table(api, eventId, tableId), table);
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  event = {
    ...plannedEvent,
    status: "CONFIRMED",
    canFinalize: true,
    canEdit: false,
    canRegister: false,
  };
  table = {
    ...plannedTable,
    eventVersion: event.version,
    eventStatus: "CONFIRMED",
    confirmed: {
      gameId: 1,
      playerIds: ["owner", guestId],
      guestPlayers: [{ participantId: guestId, name: "Alex Guest" }],
      startsAt: date,
    },
  };
  roster = [{ ...seat("owner"), name: null, username: null, email: null }];
  eventStatus = 200;
  pendingRoster = pendingWrite = undefined;
  writes.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const route = `/api/events/${eventId}`;
      expect(url.origin).toBe(api.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh");
      if (url.pathname === route)
        return Response.json(eventStatus === 200 ? event : { error: "EVENT_ACCESS_REVOKED" }, {
          status: eventStatus,
        });
      if (url.pathname.endsWith("/seats"))
        return (
          pendingRoster ??
          Response.json({
            items: roster,
            nextCursor: null,
          } satisfies CommunityPageResponse<TableSeatResponse>)
        );
      if (init?.method === "PUT") {
        expect(url.pathname).toBe(`${route}/tables/${tableId}/results`);
        writes.push({ id: tableId, input: JSON.parse(String(init.body)) });
        if (!pendingWrite) throw new Error("Unexpected result write");
        return pendingWrite;
      }
      if (url.pathname === `${route}/tables/${tableId}`) return Response.json(table);
      if (url.pathname === `${route}/tables/${otherTableId}`)
        return Response.json({ ...table, id: otherTableId });
      throw new Error(`Unexpected event results request ${url.pathname}`);
    }),
  );
});

afterEach(async () => {
  cleanup();
  await clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});

it("keeps a reviewed cached epoch while awaiting identities, then presents guest and account fallback labels", async () => {
  const reply = Promise.withResolvers<Response>();
  pendingRoster = reply.promise;
  seed();
  const { result } = renderHook(() => useEventResultsForm(api, eventId, tableId), {
    wrapper: Wrapper,
  });
  const onSaved = vi.fn();
  expect(result.current.loading).toBe(true);
  expect(result.current.playersReady).toBe(false);
  act(() => result.current.save(scores, onSaved));
  expect(writes).toEqual([]);
  expect(onSaved).not.toHaveBeenCalled();

  await act(async () => reply.resolve(Response.json({ items: roster, nextCursor: null })));
  await waitFor(() => expect(result.current.playersReady).toBe(true));
  expect(result.current.players).toEqual([
    { id: "owner", name: "owner", username: null, email: null, avatarUrl: null },
    {
      id: guestId,
      name: "Alex Guest",
      guestName: "Alex Guest",
      username: null,
      email: null,
      avatarUrl: null,
    },
  ]);
  expect(result.current.loading).toBe(false);
  expect(result.current.playersIncomplete).toBe(false);
});

it("revokes a cached results editor when its event revalidation returns access denied", async () => {
  seed();
  eventStatus = 403;
  const { result } = renderHook(() => useEventResultsForm(api, eventId, tableId), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.event.error).toMatchObject({ status: 403 }));
  expect(result.current.event.data?.version).toBe(1);
  expect(result.current.allowed).toBe(false);
  expect(result.current.playersReady).toBe(false);
  const onSaved = vi.fn();
  act(() => result.current.save(scores, onSaved));
  expect(writes).toEqual([]);
  expect(onSaved).not.toHaveBeenCalled();
});

it("reconciles a previous table’s result receipt without navigating from a newly opened editor", async () => {
  const reply = Promise.withResolvers<Response>();
  pendingWrite = reply.promise;
  seed();
  const { result, rerender } = renderHook(({ id }) => useEventResultsForm(api, eventId, id), {
    wrapper: Wrapper,
    initialProps: { id: tableId },
  });
  await waitFor(() => expect(result.current.playersReady).toBe(true));
  const onSaved = vi.fn();
  act(() => result.current.save(scores, onSaved));
  await waitFor(() => expect(writes).toEqual([{ id: tableId, input: { ...scores, version: 1 } }]));
  rerender({ id: otherTableId });
  await waitFor(() => expect(result.current.table.data?.id).toBe(otherTableId));

  event = { ...event, version: 2, resultsReady: true };
  table = {
    ...table,
    resultDraft: scores,
    eventVersion: 2,
    updatedAt: "2030-06-03T22:00:00Z",
  };
  await act(async () => reply.resolve(Response.json({ event, table })));
  await waitFor(() =>
    expect(client.getMutationCache().getAll().at(-1)?.state.status).toBe("success"),
  );
  expect(client.getQueryData(eventRecordKeys.table(api, eventId, tableId))).toMatchObject({
    id: tableId,
    eventVersion: 2,
    resultDraft: scores,
  });
  expect(result.current.table.data?.id).toBe(otherTableId);
  expect(onSaved).not.toHaveBeenCalled();
  expect(writes).toHaveLength(1);
});
