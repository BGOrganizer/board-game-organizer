import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableGuestVotes,
} from "@board-game-organizer/schemas";
import { canEditTableGuestVotes, useTableGuestVoteForm } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";

const eventPath = `/api/events/${plannedEvent.id}`;
const guestPath = `${eventPath}/tables/${plannedTable.id}/guests/guest%2Fentry`;
const options = {
  apiUrl: "https://guest-form.test",
  userId: "owner",
  getToken: async () => "manager-token",
};
const table: PlannedTableResponse = {
  ...plannedTable,
  canManage: true,
  games: [...plannedTable.games, { gameId: 2 }],
};
const event: PlannedEventResponse = {
  ...plannedEvent,
  canManage: true,
  dateVoteRequired: true,
  locations: [
    ...plannedEvent.locations,
    { ...plannedEvent.locations[0], id: "second", name: "Club annex" },
  ],
};
const ballots: TableGuestVotes = {
  guestName: "Ada",
  dateVotes: {},
  locationVotes: { [event.locations[0].id]: "YES" },
  gameVotes: { "1": "YES" },
};

function setup(
  overrides: { eventStatus?: number; guestStatus?: number; event?: PlannedEventResponse } = {},
) {
  let eventStatus = overrides.eventStatus ?? 200;
  let guestStatus = overrides.guestStatus ?? 200;
  let saved = ballots;
  let completeVote: (() => void) | undefined;
  const requests: { method: string; path: string; input?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const method = init?.method ?? "GET";
      expect(url.origin).toBe(options.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer manager-token");
      requests.push({
        method,
        path: url.pathname,
        ...(init?.body && { input: JSON.parse(String(init.body)) }),
      });
      if (url.pathname === eventPath) {
        expect(method).toBe("GET");
        return Response.json(overrides.event ?? event, { status: eventStatus });
      }
      if (url.pathname === guestPath) {
        expect(method).toBe("GET");
        return Response.json(saved, { status: guestStatus });
      }
      expect(url.pathname).toBe(`${guestPath}/votes`);
      expect(method).toBe("POST");
      await new Promise<void>((resolve) => {
        completeVote = resolve;
      });
      return Response.json(saved);
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    requests,
    wrapper,
    restoreEvent() {
      eventStatus = 200;
    },
    restoreVotes() {
      guestStatus = 200;
    },
    finish(next: TableGuestVotes) {
      saved = next;
      expect(completeVote).toBeTypeOf("function");
      completeVote?.();
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each([
  { canManage: false },
  { readOnly: true },
  { eventStatus: "CONFIRMED" as const },
  { groupType: "PUBLIC" as const },
  { games: plannedTable.games, eventSchedule: undefined },
])("rejects a table without guest-vote authority or active options: %j", async (patch) => {
  const invalid = { ...table, ...patch };
  expect(canEditTableGuestVotes(invalid)).toBe(false);
  const { requests, wrapper } = setup();
  const { result } = renderHook(() => useTableGuestVoteForm(options, invalid, "guest/entry"), {
    wrapper,
  });
  expect(result.current).toMatchObject({
    unavailable: true,
    error: true,
    loading: false,
    sections: [],
  });
  const onSaved = vi.fn();
  await act(async () => {
    result.current.refresh();
    result.current.submit(onSaved);
  });
  expect(requests).toEqual([]);
  expect(onSaved).not.toHaveBeenCalled();
});

it.each([
  { dateCount: 2 },
  { locationCount: 2 },
  { dateVoteRequired: true },
  { locationVoteRequired: true },
])("allows an otherwise singleton table when its schedule requires a ballot: %j", (schedule) => {
  expect(
    canEditTableGuestVotes({
      ...table,
      games: plannedTable.games,
      eventSchedule: {
        localStartsAt: null,
        location: null,
        dateCount: 1,
        locationCount: 1,
        ...schedule,
      },
    }),
  ).toBe(true);
});

it("omits reads when the owning screen disables its hooks", async () => {
  const { requests, wrapper } = setup();
  const { result } = renderHook(
    () => useTableGuestVoteForm({ ...options, enabled: false }, table, "guest/entry"),
    { wrapper },
  );
  await act(async () => {});
  expect(result.current).toMatchObject({ loading: true, canSubmit: false, sections: [] });
  expect(requests).toEqual([]);
});

it("stages mixed choices, prevents a duplicate write and reconciles the accepted ballots", async () => {
  const port = setup();
  const { result } = renderHook(() => useTableGuestVoteForm(options, table, "guest/entry"), {
    wrapper: port.wrapper,
  });
  expect(result.current.loading).toBe(true);
  await waitFor(() =>
    expect(result.current.sections.map(({ kind }) => kind)).toEqual(["date", "location", "game"]),
  );
  const dateId = event.dates[0].id;
  const [dates, locations, games] = result.current.sections;
  expect(dates.rows[0]).toMatchObject({
    key: `date:${dateId}`,
    timeZone: "Europe/Rome",
    allowNo: true,
  });
  expect(locations.rows[0]).toMatchObject({ label: "Club venue", value: "YES", allowNo: false });
  expect(games.rows[1]).toMatchObject({ key: "game:2", label: "", game: undefined });
  const onSaved = vi.fn();
  act(() => {
    result.current.choose(locations.rows[0], "NO");
    result.current.choose(games.rows[0], "YES");
    result.current.submit(onSaved);
  });
  expect(result.current.canSubmit).toBe(false);
  expect(port.requests.every(({ method }) => method === "GET")).toBe(true);
  act(() => {
    result.current.choose(dates.rows[0], "NO");
    result.current.choose(locations.rows[1], "IF_NEEDED");
    result.current.choose(games.rows[1], "IF_NEEDED");
  });
  expect(result.current.canSubmit).toBe(true);
  act(() => {
    result.current.submit(onSaved);
    result.current.submit(onSaved);
    result.current.choose(result.current.sections[0].rows[0], "YES");
  });
  await waitFor(() =>
    expect(port.requests.filter(({ method }) => method === "POST")).toEqual([
      {
        method: "POST",
        path: `${guestPath}/votes`,
        input: {
          votes: [
            { kind: "date", optionId: dateId, vote: "NO" },
            { kind: "location", optionId: "second", vote: "IF_NEEDED" },
            { kind: "game", tableId: table.id, gameId: 2, vote: "IF_NEEDED" },
          ],
        },
      },
    ]),
  );
  expect(result.current.saving).toBe(true);
  expect(onSaved).not.toHaveBeenCalled();
  act(() =>
    port.finish({
      ...ballots,
      dateVotes: { [dateId]: "NO" },
      locationVotes: { ...ballots.locationVotes, second: "IF_NEEDED" },
      gameVotes: { ...ballots.gameVotes, "2": "IF_NEEDED" },
    }),
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(result.current.canSubmit).toBe(false);
  expect(result.current.sections[0].rows[0].value).toBe("NO");
});

it.each(["event", "guest"] as const)(
  "recovers a transient %s read with an explicit refresh",
  async (target) => {
    const port = setup(target === "event" ? { eventStatus: 503 } : { guestStatus: 503 });
    const { result } = renderHook(() => useTableGuestVoteForm(options, table, "guest/entry"), {
      wrapper: port.wrapper,
    });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current).toMatchObject({ loading: false, unavailable: false, sections: [] });
    if (target === "event") port.restoreEvent();
    else port.restoreVotes();
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe(false));
    expect(result.current.sections).toHaveLength(3);
    expect(
      port.requests.filter(({ path }) => path === (target === "event" ? eventPath : guestPath)),
    ).toHaveLength(2);
  },
);

it.each([
  { event: { ...event, canManage: false } },
  { event: { ...event, status: "CONFIRMED" as const } },
  { guestStatus: 403 },
])("keeps ballots hidden after authoritative access changes: %j", async (override) => {
  const port = setup(override);
  const { result } = renderHook(() => useTableGuestVoteForm(options, table, "guest/entry"), {
    wrapper: port.wrapper,
  });
  await waitFor(() => expect(result.current.unavailable).toBe(true));
  expect(result.current).toMatchObject({ sections: [], error: true, canSubmit: false });
  expect(port.requests.map(({ path }) => path)).toEqual(
    "guestStatus" in override ? [eventPath, guestPath] : [eventPath],
  );
});
