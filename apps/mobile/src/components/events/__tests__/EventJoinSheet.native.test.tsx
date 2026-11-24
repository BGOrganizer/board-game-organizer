// React state/consent tests use the actual sheet and form. The maintained native
// preset has no UI-thread reactions, so Gorhom cannot complete its opening
// animation here. Content assertions establish rendering, not physical visibility;
// native opening, voting and touch acceptance belong to the Maestro invite flow.
import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { CommunityApiError, eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  plannedEvent,
  plannedTable,
  seat,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventJoinSheet } from "../EventJoinSheet";

const API = "https://join-sheet-fixtures.test";
const boundary = vi.hoisted(() => ({
  userId: "owner",
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
}));
const options = () => ({
  apiUrl: API,
  userId: boundary.userId,
  getToken: async () => "fixture-owner-token",
  enabled: true,
  feedback: boundary.feedback,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let eventStatus: number;
let tableStatus: number;
let writeStatus: number;
let pendingEvent: Promise<Response> | undefined;
let pendingTable: Promise<Response> | undefined;
const writes: { method: string; path: string; input: Record<string, unknown> }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const secondDate = "44444444-4444-4444-8444-444444444444";
const secondLocation = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  boundary.userId = "owner";
  event = { ...plannedEvent, myVotes: { dateVotes: {}, locationVotes: {} }, myRegistrations: [] };
  table = { ...plannedTable, myRegistration: null, canRespond: false };
  eventStatus = 200;
  tableStatus = 200;
  writeStatus = 200;
  pendingEvent = undefined;
  pendingTable = undefined;
  writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected fixture origin: ${url.origin}`);
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        writes.push({ method, path: url.pathname, input: JSON.parse(String(init?.body)) });
        return json(
          writeStatus === 200
            ? { ...seat(boundary.userId), eventVersion: event.version + 1 }
            : { error: "Fixture registration rejected" },
          writeStatus,
        );
      }
      if (url.pathname === `/api/events/${event.id}`)
        return (
          pendingEvent ??
          json(eventStatus === 200 ? event : { error: "Fixture event unavailable" }, eventStatus)
        );
      if (url.pathname === `/api/events/${event.id}/tables/${table.id}`)
        return (
          pendingTable ??
          json(tableStatus === 200 ? table : { error: "Fixture table unavailable" }, tableStatus)
        );
      if (url.pathname === `/api/events/${event.id}/tables`)
        return json({ items: [table], nextCursor: null });
      if (url.pathname.endsWith("/seats")) return json({ items: [], nextCursor: null });
      if (url.pathname === "/api/events" || url.pathname === "/api/groups")
        return json({ items: [], nextCursor: null });
      throw new Error(`Unexpected fixture path: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({ onClose = () => {}, ...props }: Partial<ComponentProps<typeof EventJoinSheet>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventJoinSheet eventId={event.id} tableId={table.id} {...props} onClose={onClose} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function ready() {
  await waitFor(() => expect(screen.getByTestId("table-consent-submit")).toBeEnabled());
}
async function press(name: string) {
  await userEvent.setup().press(screen.getByRole("button", { name }));
}
function multipleOptions() {
  event = {
    ...event,
    dates: [...event.dates, { id: secondDate, day: "2030-06-04" }],
    locations: [
      ...event.locations,
      { ...event.locations[0], id: secondLocation, name: "Second club" },
    ],
  };
  table = {
    ...table,
    games: [...table.games, { gameId: 2, durationMinutes: 60, durationSource: "BGG" }],
    gamesDetail: [
      ...table.gamesDetail,
      { id: 2, name: "Second chess", imageUrl: null, year: null },
    ],
  };
}
async function vote(label: string, choice = "Yes") {
  await press(`${label}: ${choice}`);
}
async function tab(name: string) {
  await userEvent.setup().press(screen.getByRole("tab", { name }));
}

it("presents fixed singleton facts without ballots and submits one explicit consent with empty vote maps", async () => {
  const close = vi.fn();
  await render(<Fixture onClose={close} />);
  await ready();
  expect(screen.getByText("Club venue")).toBeOnTheScreen();
  expect(screen.getByText("Chess")).toBeOnTheScreen();
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
  expect(writes).toHaveLength(0);
  await press("Join table");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    method: "POST",
    path: `/api/events/${event.id}/tables/${table.id}/registrations`,
    input: {
      version: event.version,
      gameVotes: {},
      availability: { version: event.version, dateVotes: {}, locationVotes: {} },
    },
  });
  expect(close).toHaveBeenCalledOnce();
});

it("requires an explicit positive answer to the changed singleton game before joining", async () => {
  table = { ...table, gameVoteRequired: true };
  await render(<Fixture />);
  await ready();
  await screen.findByRole("tab", { name: "Games" });
  await vote("Chess", "No");
  await press("Join table");
  expect(writes).toHaveLength(0);
  await vote("Chess", "If needed");
  await press("Join table");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toMatchObject({ gameVotes: { "1": "IF_NEEDED" } });
});

it("cancels consent without granting membership, submitting votes or registering a seat", async () => {
  const close = vi.fn();
  await render(<Fixture onClose={close} />);
  await ready();
  await press("Cancel");
  expect(close).toHaveBeenCalledOnce();
  expect(writes).toHaveLength(0);
});

it("validates every category, retains answered tabs and submits complete positive preferences", async () => {
  multipleOptions();
  const close = vi.fn();
  await render(<Fixture onClose={close} />);
  await ready();
  expect(screen.getByRole("tab", { name: "Dates" })).toBeSelected();
  await press("Join table");
  expect(
    screen.getByText(
      "Answer every option and choose at least one Yes or If needed in each section.",
    ),
  ).toBeOnTheScreen();
  expect(writes).toHaveLength(0);
  await vote("2030-06-03 20:00");
  await vote("2030-06-04 20:00", "No");
  await tab("Locations");
  await vote("Club venue", "If needed");
  await vote("Second club", "No");
  await tab("Games");
  await vote("Chess");
  await vote("Second chess", "No");
  await tab("Dates");
  expect(screen.getByRole("button", { name: "2030-06-03 20:00: Yes" })).toBeSelected();
  await press("Join table");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toMatchObject({
    gameVotes: { "1": "YES", "2": "NO" },
    availability: {
      version: 1,
      dateVotes: { [event.dates[0].id]: "YES", [secondDate]: "NO" },
      locationVotes: { [event.locations[0].id]: "IF_NEEDED", [secondLocation]: "NO" },
    },
  });
  expect(close).toHaveBeenCalledOnce();
});

it("rejects an all-negative category and focuses it again when the user tries to submit", async () => {
  multipleOptions();
  await render(<Fixture />);
  await ready();
  await vote("2030-06-03 20:00", "No");
  await vote("2030-06-04 20:00", "No");
  await tab("Games");
  await press("Join table");
  expect(screen.getByRole("tab", { name: "Dates" })).toBeSelected();
  expect(
    screen.getByText(
      "Answer every option and choose at least one Yes or If needed in each section.",
    ),
  ).toBeOnTheScreen();
  expect(writes).toHaveLength(0);
});

it("uses game-first preferences when the viewer already participates at another table", async () => {
  multipleOptions();
  event = { ...event, myRegistrations: [{ ...seat("owner"), tableId: "other-table" }] };
  await render(<Fixture />);
  await ready();
  expect(screen.getByRole("tab", { name: "Games" })).toBeSelected();
  expect(screen.getByText("Chess")).toBeOnTheScreen();
});

it("accepts only the current viewer's real pending invitation using its captured version", async () => {
  const invitation = { ...seat("owner"), status: "PENDING" as const, version: 7 };
  table = { ...table, myRegistration: invitation, canRespond: true, canRegister: false };
  const close = vi.fn();
  await render(<Fixture registrationId={invitation.id} onClose={close} />);
  await ready();
  expect(
    screen.getByText(
      "Accepting this invitation accepts the current event and table settings. Vote only where multiple options are available.",
    ),
  ).toBeOnTheScreen();
  await press("Accept invitation");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    method: "PATCH",
    path: `/api/table-registrations/${invitation.id}`,
    input: {
      action: "accept",
      version: 7,
      participation: { version: event.version, gameVotes: {} },
    },
  });
  expect(close).toHaveBeenCalledOnce();
});

it.each(["wrong-owner", "already-accepted", "missing-permission"] as const)(
  "does not fabricate available invitation consent (%s)",
  async (kind) => {
    const invitation = {
      ...seat(kind === "wrong-owner" ? "other-owner" : "owner"),
      status: kind === "already-accepted" ? ("ACCEPTED" as const) : ("PENDING" as const),
    };
    table = { ...table, myRegistration: invitation, canRespond: kind !== "missing-permission" };
    await render(<Fixture registrationId={invitation.id} />);
    expect(await screen.findByText("Invitation unavailable")).toBeOnTheScreen();
    expect(screen.getByTestId("table-consent-submit")).toBeDisabled();
    await press("Accept invitation");
    expect(writes).toHaveLength(0);
  },
);

it("keeps public fixed schedule facts out of voting and omits private availability from consent", async () => {
  event = { ...event, groupType: "PUBLIC", bookingClosesAt: "2030-06-01T20:00:00.000Z" };
  table = { ...table, groupType: "PUBLIC" };
  await render(<Fixture />);
  await ready();
  expect(screen.queryAllByRole("tab")).toHaveLength(0);
  await press("Join table");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toEqual({ version: event.version, gameVotes: {} });
});

it.each(["confirmed", "cutoff", "cannot-register"] as const)(
  "keeps registration disabled when the current authorized table is %s",
  async (reason) => {
    if (reason === "confirmed") {
      event = { ...event, status: "CONFIRMED" };
      table = { ...table, eventStatus: "CONFIRMED" };
    } else if (reason === "cutoff") {
      event = { ...event, groupType: "PUBLIC", bookingClosesAt: "2020-01-01T00:00:00.000Z" };
      table = { ...table, groupType: "PUBLIC" };
    } else table = { ...table, canRegister: false };
    await render(<Fixture />);
    await screen.findByText("Club venue");
    expect(screen.getByTestId("table-consent-submit")).toBeDisabled();
    await press("Join table");
    expect(writes).toHaveLength(0);
  },
);

it("keeps consent disabled while current table facts are missing, then reveals them after the read resolves", async () => {
  let finish: (response: Response) => void = () => {};
  pendingTable = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await screen.findByText("Club venue");
  expect(screen.getByTestId("table-consent-submit")).toBeDisabled();
  expect(screen.queryByText("Chess")).toBeNull();
  await act(() => finish(json(table)));
  await ready();
  expect(screen.getByText("Chess")).toBeOnTheScreen();
});

it.each(["event", "table"] as const)(
  "keeps a failed %s read observable and only enables consent after a successful deliberate retry",
  async (source) => {
    if (source === "event") eventStatus = 503;
    else tableStatus = 503;
    await render(<Fixture />);
    expect(await screen.findByText("Unable to load data. Try again.")).toBeOnTheScreen();
    expect(screen.getByTestId("table-consent-submit")).toBeDisabled();
    eventStatus = tableStatus = 200;
    await press("Try again");
    await ready();
    expect(screen.queryByText("Unable to load data. Try again.")).toBeNull();
  },
);

it("renders new authoritative fixed facts without reopening or accepting stale hidden settings", async () => {
  await render(<Fixture />);
  await ready();
  const changedEvent = {
    ...event,
    version: 2,
    locations: [{ ...event.locations[0], name: "Authoritative new venue" }],
  };
  const changedTable = {
    ...table,
    gamesDetail: [{ ...table.gamesDetail[0], name: "Authoritative new game" }],
  };
  await act(() => {
    client.setQueryData(eventRecordKeys.detail(options(), event.id), changedEvent);
    client.setQueryData(eventRecordKeys.table(options(), event.id, table.id), changedTable);
  });
  expect(await screen.findByText("Authoritative new venue")).toBeOnTheScreen();
  expect(screen.getByText("Authoritative new game")).toBeOnTheScreen();
  expect(screen.queryByText("Club venue")).toBeNull();
  await press("Join table");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input.version).toBe(2);
});

it("displays a known rejected participation and allows recovery without inventing a successful registration", async () => {
  const error = new CommunityApiError(400, "Fixture participation rejected");
  client.getMutationCache().build(
    client,
    { mutationKey: [...eventRecordKeys.mutation(options(), event.id), "register"] },
    {
      context: undefined,
      data: undefined,
      error,
      failureCount: 1,
      failureReason: error,
      isPaused: false,
      status: "error",
      submittedAt: Date.now(),
      variables: {
        tableId: table.id,
        version: event.version,
        gameVotes: {},
        availability: { version: event.version, dateVotes: {}, locationVotes: {} },
      },
    },
  );
  await render(<Fixture />);
  expect(await screen.findByText("Could not join table")).toBeOnTheScreen();
  await ready();
  expect(writes).toHaveLength(0);
});

it.each([
  ["date", "Dates", "2030-06-03 20:00", "dateVotes"],
  ["location", "Locations", "Club venue", "locationVotes"],
] as const)(
  "requires a new positive %s vote while retaining the fixed game fact",
  async (category, tabName, label, voteKey) => {
    event = {
      ...event,
      ...(category === "date" ? { dateVoteRequired: true } : { locationVoteRequired: true }),
    };
    table = { ...table, gamesDetail: [] };
    await render(<Fixture />);
    await ready();
    expect(
      screen.getByText("Review the event and table settings, then vote in the sections shown."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: tabName })).toBeSelected();
    expect(screen.queryByRole("tab", { name: "Games" })).toBeNull();
    expect(screen.getByText("Unknown")).toBeOnTheScreen();
    await press("Join table");
    expect(writes).toHaveLength(0);
    await vote(label, "If needed");
    await press("Join table");
    await waitFor(() => expect(writes).toHaveLength(1));
    const option = category === "date" ? event.dates[0] : event.locations[0];
    expect(writes[0].input).toMatchObject({
      gameVotes: {},
      availability: { [voteKey]: { [option.id]: "IF_NEEDED" } },
    });
  },
);

it("shows an explicit fallback when vote metadata for a canonical game option is missing", async () => {
  table = { ...table, gameVoteRequired: true, gamesDetail: [] };
  await render(<Fixture />);
  await ready();
  expect(screen.getByRole("tab", { name: "Games" })).toBeSelected();
  expect(screen.getByText("Unknown")).toBeOnTheScreen();
  await vote("Unknown");
  await press("Join table");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input.gameVotes).toEqual({ "1": "YES" });
});

it("keeps a rejected pending invitation explicit without closing it or changing registration", async () => {
  const invitation = { ...seat("owner"), status: "PENDING" as const, version: 7 };
  const close = vi.fn();
  table = { ...table, myRegistration: invitation, canRespond: true, canRegister: false };
  writeStatus = 422;
  await render(<Fixture registrationId={invitation.id} onClose={close} />);
  await ready();
  await press("Accept invitation");
  expect(await screen.findByText("Could not accept invitation")).toBeOnTheScreen();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    method: "PATCH",
    path: `/api/table-registrations/${invitation.id}`,
    input: { action: "accept", version: 7 },
  });
  expect(close).not.toHaveBeenCalled();
  await ready();
});
