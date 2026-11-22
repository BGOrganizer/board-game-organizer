import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import {
  plannedEvent,
  plannedTable,
  seat,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventTableOverview } from "../EventTableOverview";
import { EventVoteLegend } from "../EventVoteLegend";

const API = "https://table-overview-fixtures.test";
const boundary = vi.hoisted(() => ({
  push: vi.fn(),
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
  picker: { open: vi.fn(), dismiss: vi.fn() },
}));
const options = {
  apiUrl: API,
  userId: "owner",
  enabled: true,
  getToken: async () => "fixture-overview-token",
  feedback: boundary.feedback,
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => ({}),
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: boundary.picker,
}));
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let roster: TableSeatResponse[];
let eventStatus: number;
let tableStatus: number;
let writeStatus: number;
let pendingEvent: Promise<Response> | undefined;
let pendingTable: Promise<Response> | undefined;
let pendingWrite: Promise<Response> | undefined;
const writes: { path: string; input: Record<string, unknown> }[] = [];
const reads: string[] = [];
const json = (value: unknown, code = 200) =>
  new Response(JSON.stringify(value), {
    status: code,
    headers: { "content-type": "application/json" },
  });
const ownId = "44444444-4444-4444-8444-444444444444";
const guestId = "55555555-5555-4555-8555-555555555555";
function multipleGames() {
  table = {
    ...table,
    games: [
      { gameId: 1, durationMinutes: 60 },
      { gameId: 2, durationMinutes: 30 },
    ],
    gamesDetail: [
      ...plannedTable.gamesDetail,
      { id: 2, name: "Strategy game", imageUrl: null, year: null },
    ],
    gameVoteCounts: {
      "1": { YES: 1, IF_NEEDED: 0, NO: 1, UNKNOWN: 0 },
      "2": { YES: 0, IF_NEEDED: 1, NO: 1, UNKNOWN: 0 },
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  eventStatus = tableStatus = writeStatus = 200;
  pendingEvent = pendingTable = pendingWrite = undefined;
  writes.length = reads.length = 0;
  roster = [
    { ...seat("owner"), id: ownId, seatIndex: 0, gameVotes: { "1": "YES" } },
    { ...seat("guest"), id: guestId, seatIndex: 1, sequence: 2 },
  ];
  event = {
    ...plannedEvent,
    canManage: false,
    role: "participant",
    canVote: true,
    myRegistrations: [roster[0]],
  };
  table = {
    ...plannedTable,
    canManage: false,
    canLeave: true,
    canInvite: false,
    canRegister: false,
    myRegistration: roster[0],
    myPosition: "SEATED",
    acceptedCount: 2,
    seatedCount: 2,
    occupiedSeatIndices: [0, 1],
    eventVersion: 1,
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected overview origin: ${url.origin}`);
      const path = url.pathname;
      if ((init?.method ?? "GET") !== "GET") {
        const body = JSON.parse(String(init?.body));
        writes.push({ path, input: body });
        if (pendingWrite) return pendingWrite;
        if (writeStatus !== 200)
          return json({ error: "Fixture overview action rejected" }, writeStatus);
        if (path.endsWith("/votes")) {
          if (table.myRegistration)
            table = {
              ...table,
              myRegistration: {
                ...table.myRegistration,
                gameVotes: { ...table.myRegistration.gameVotes, [String(body.gameId)]: body.vote },
              },
            };
          return json(event);
        }
        if (path.startsWith("/api/table-registrations/")) {
          const prior = roster.find((row) => path.endsWith(row.id));
          if (!prior) throw new Error(`Unknown fixture registration ${path}`);
          roster = roster.filter((row) => row.id !== prior.id);
          if (prior.userId === "owner")
            table = {
              ...table,
              myRegistration: null,
              canLeave: false,
              acceptedCount: 1,
              seatedCount: 1,
            };
          return json({
            ...prior,
            status: "CANCELLED",
            version: prior.version + 1,
            eventVersion: 2,
          });
        }
        throw new Error(`Unexpected overview write: ${path}`);
      }
      reads.push(path);
      if (path === `/api/events/${event.id}`)
        return (
          pendingEvent ??
          json(
            eventStatus === 200 ? event : { error: "Fixture event read unavailable" },
            eventStatus,
          )
        );
      if (path === `/api/events/${event.id}/tables/${table.id}`)
        return (
          pendingTable ??
          json(
            tableStatus === 200 ? table : { error: "Fixture table read unavailable" },
            tableStatus,
          )
        );
      if (path.endsWith("/proposals"))
        return json({
          eventId: event.id,
          groupId: event.groupId,
          eventVersion: event.version,
          mode: "mine",
          items: [],
          nextCursor: null,
        });
      if (path.endsWith("/seats/order"))
        return json({
          version: 1,
          allocationKey: "overview-fixture",
          capacity: 4,
          seatedCount: roster.length,
          registrations: roster,
        });
      if (path.endsWith("/seats"))
        return json({
          items: url.searchParams.get("pending") === "true" ? [] : roster,
          nextCursor: null,
        });
      if (path === `/api/events/${event.id}/tables`)
        return json({ items: [table], nextCursor: null });
      if (path === "/api/events" || path === "/api/groups")
        return json({ items: [], nextCursor: null });
      throw new Error(`Unexpected overview read: ${path}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture(props: Partial<ComponentProps<typeof EventTableOverview>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventTableOverview
          eventId={event.id}
          tableId={table.id}
          header={<Text>Table detail header</Text>}
          {...props}
        />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
async function ready() {
  await screen.findByText("Chess");
}

it("renders the canonical parent event, singleton game and preserved detail header without offering a redundant ballot", async () => {
  await render(<Fixture />);
  await ready();
  expect(screen.getByText("Table detail header")).toBeVisible();
  expect(screen.getByRole("button", { name: `Open event: ${event.name}` })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Chess: Yes" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Chess: Choose your vote" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Board games: Voting legend" })).toBeNull();
  expect(writes).toHaveLength(0);
});

it("moves the games legend and allowed proposals to Details and ends with the parent event", async () => {
  multipleGames();
  table.allowParticipantGames = true;
  await installNativePopoverMeasurements();
  await render(<Fixture />);
  await ready();
  await screen.findByText("Proposed games");
  const labels = screen
    .getAllByText(/^(Board games|Proposed games|Event)$/)
    .map((node) => node.props.children);
  expect(labels).toEqual(["Board games", "Proposed games", "Event"]);
  expect(screen.queryByRole("button", { name: "Board games: Voting legend" })).toBeNull();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Table details help" }));
  expect(
    screen.getByText("You can vote only if you are an accepted participant at this table."),
  ).toBeVisible();
  expect(screen.getByText(/can propose other games for a manager to approve/)).toBeVisible();
});

it.each(["PLANNING", "CONFIRMED"] as const)(
  "explains Table participation during %s",
  async (status) => {
    table.eventStatus = status;
    await installNativePopoverMeasurements();
    await render(<Fixture section="participants" />);
    const trigger = await screen.findByRole("button", { name: "Table participants help" });
    expect(screen.queryByRole("button", { name: "Waiting list: Field help" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Seats list: Field help" })).toBeNull();
    await pressMeasuredPopover(trigger);
    for (const label of [
      "Accepted player",
      "Invitation pending",
      "Player on the waiting list",
      "Demonstrator",
      "Guest",
    ])
      expect(screen.getByText(label)).toBeVisible();
    if (status === "PLANNING") {
      expect(screen.getByText(/select a free place or the waiting list/)).toBeVisible();
      expect(screen.getByText(/Accepted players on the waiting list can vote/)).toBeVisible();
      expect(screen.getByText("Pending invitations do not count toward agreement.")).toBeVisible();
    } else {
      expect(
        screen.getByText("Only players with a confirmed seat take part at this table."),
      ).toBeVisible();
      expect(screen.queryByText(/select a free place or the waiting list/)).toBeNull();
    }
  },
);

it("keeps context-local table details concise without rendering a second parent-event card", async () => {
  await render(<Fixture context="event" />);
  await ready();
  expect(screen.queryByRole("button", { name: `Open event: ${event.name}` })).toBeNull();
  expect(screen.getByText("Table detail header")).toBeVisible();
});

it("retains a navigable parent fallback while its own canonical event facts are pending", async () => {
  let finish: (value: Response) => void = () => {};
  pendingEvent = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await ready();
  await press(`Open event: ${table.eventName}`);
  expect(boundary.push).toHaveBeenCalledWith({
    pathname: "/event/[eventId]",
    params: { eventId: table.eventId },
  });
  pendingEvent = undefined;
  await act(() => finish(json(event)));
  expect(await screen.findByText("1 Table")).toBeVisible();
});

it("keeps initial missing table data loading and displays the canonical game only when the request resolves", async () => {
  let finish: (value: Response) => void = () => {};
  pendingTable = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText("Chess")).toBeNull();
  expect(screen.queryByText("Could not load table")).toBeNull();
  pendingTable = undefined;
  await act(() => finish(json(table)));
  await ready();
});

it("keeps a failed initial table read observable and retries both parent/detail sources explicitly", async () => {
  tableStatus = 503;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load table")).toBeVisible();
  tableStatus = 200;
  await press("Try again");
  await ready();
  expect(reads.filter((path) => path === `/api/events/${event.id}`).length).toBeGreaterThan(0);
});

it("keeps cached table games usable when an ordinary background refresh fails", async () => {
  client.setQueryData(eventRecordKeys.table(options, event.id, table.id), table);
  await render(<Fixture />);
  await ready();
  expect(screen.getByText("Chess")).toBeVisible();
  tableStatus = 503;
  await act(() =>
    client.invalidateQueries({
      queryKey: eventRecordKeys.table(options, event.id, table.id),
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not load complete table details")).toBeVisible();
  expect(screen.getByText("Chess")).toBeVisible();
  tableStatus = 200;
  await press("Try again");
  await waitFor(() =>
    expect(screen.queryByText("Could not load complete table details")).toBeNull(),
  );
});

it("keeps a failed parent read recoverable while rendering already-authorized table games", async () => {
  eventStatus = 503;
  await render(<Fixture />);
  await ready();
  expect(await screen.findByText("Could not load event")).toBeVisible();
  eventStatus = 200;
  await press("Try again");
  expect(await screen.findByText("1 Table")).toBeVisible();
});

it("removes cached game/roster details after server authorization is revoked", async () => {
  client.setQueryData(eventRecordKeys.table(options, event.id, table.id), table);
  await render(<Fixture />);
  await ready();
  expect(screen.getByText("Chess")).toBeVisible();
  tableStatus = 403;
  await act(() =>
    client.invalidateQueries({
      queryKey: eventRecordKeys.table(options, event.id, table.id),
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not load table")).toBeVisible();
  expect(screen.queryByText("Chess")).toBeNull();
});

it("opens one game-vote dialog for an accepted participant and prevents removal of its last positive preference", async () => {
  multipleGames();
  table = {
    ...table,
    gameVoteVoters: {
      "1": {
        YES: [{ userId: "owner", name: "Owner", username: null, avatarUrl: null }],
        IF_NEEDED: [],
        NO: [],
      },
      "2": { YES: [], IF_NEEDED: [], NO: [] },
    },
  };
  await render(<Fixture />);
  await ready();
  expect(screen.queryByLabelText("Votes: Chess")).toBeNull();
  const summary = screen.getByRole("button", { name: "Vote summary: Chess" });
  expect(within(summary).getByText("Votes")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Vote summary: Strategy game" })).toBeNull();
  await press("Vote summary: Chess");
  expect(screen.getByLabelText("Votes: Chess")).toBeVisible();
  await press("Vote summary: Chess");
  expect(screen.queryByLabelText("Votes: Chess")).toBeNull();
  await press("Chess: Yes");
  const dialog = within(screen.getByTestId("confirmation-dialog"));
  expect(dialog.getByRole("button", { name: "No" })).toBeDisabled();
  expect(dialog.getByRole("button", { name: "If needed" })).toBeEnabled();
  await userEvent.setup().press(dialog.getByRole("button", { name: "If needed" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    path: `/api/events/${event.id}/votes`,
    input: { kind: "game", tableId: table.id, gameId: 1, vote: "IF_NEEDED" },
  });
});

it.each(["pending", "cannot-vote", "event-confirmed", "table-confirmed"] as const)(
  "withholds game ballots for a %s projection without changing visible authorized game facts",
  async (kind) => {
    multipleGames();
    if (kind === "pending")
      table = { ...table, myRegistration: { ...roster[0], status: "PENDING" } };
    else if (kind === "cannot-vote") event = { ...event, canVote: false };
    else if (kind === "event-confirmed") event = { ...event, status: "CONFIRMED" };
    else
      table = {
        ...table,
        eventStatus: "CONFIRMED",
        confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
      };
    await render(<Fixture />);
    await ready();
    expect(screen.queryByRole("button", { name: "Chess: Yes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Strategy game: Choose your vote" })).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it("limits a confirmed table to its frozen game and renders its actual chosen schedule", async () => {
  multipleGames();
  event = { ...event, status: "CONFIRMED" };
  table = {
    ...table,
    eventStatus: "CONFIRMED",
    confirmed: { gameId: 2, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  };
  await render(<Fixture context="event" />);
  expect(await screen.findByText("Strategy game")).toBeVisible();
  expect(screen.queryByText("Chess")).toBeNull();
  expect(screen.getByLabelText("Table schedule")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Choose your vote/ })).toBeNull();
});

it("requires explicit leave confirmation and keeps cancellation free of backend side effects", async () => {
  await render(<Fixture section="participants" />);
  await screen.findByText("@owner");
  await press("Leave table");
  expect(screen.getByText("This removes the active table registration.")).toBeVisible();
  expect(writes).toHaveLength(0);
  await press("Cancel");
  expect(writes).toHaveLength(0);
  expect(screen.getByText("@owner")).toBeVisible();
});

it("leaves only the current viewer's captured active registration after explicit confirmation", async () => {
  await render(<Fixture section="participants" />);
  await screen.findByText("@owner");
  await press("Leave table");
  await press("Confirm");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    path: `/api/table-registrations/${ownId}`,
    input: { action: "cancel", version: 1 },
  });
});

it("lets authorized managers remove another player without confusing it with the manager's own consent", async () => {
  table = { ...table, canInvite: true, canManage: true };
  event = { ...event, canManage: true, managementRole: "admin" };
  await render(<Fixture section="participants" />);
  await screen.findByText("@guest");
  await press("Remove player: @guest");
  await press("Confirm");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    path: `/api/table-registrations/${guestId}`,
    input: { action: "remove", version: 1 },
  });
});

it("refuses a stale leave decision when the server changes the table to confirmed", async () => {
  await render(<Fixture section="participants" />);
  await screen.findByText("@owner");
  await press("Leave table");
  const updated = {
    ...table,
    eventStatus: "CONFIRMED" as const,
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  };
  await act(() => client.setQueryData(eventRecordKeys.table(options, event.id, table.id), updated));
  await press("Confirm");
  expect(writes).toHaveLength(0);
});

it("keeps rejected registration removal observable and retains the authoritative roster", async () => {
  writeStatus = 400;
  await render(<Fixture section="participants" />);
  await screen.findByText("@owner");
  await press("Leave table");
  await press("Confirm");
  await waitFor(() => expect(boundary.feedback.onError).toHaveBeenCalled());
  expect(await screen.findByText("@owner")).toBeVisible();
});

it("renders an authorized shared-results-only projection without mounting a management roster", async () => {
  table = {
    ...table,
    myRegistration: null,
    canLeave: false,
    sharedResultsOnly: true,
    readOnly: true,
    eventStatus: "TERMINATED",
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  };
  event = { ...event, status: "TERMINATED", readOnly: true, canVote: false, myRegistrations: [] };
  await render(<Fixture />);
  await ready();
  expect(screen.queryByText("Seats list")).toBeNull();
  expect(reads.some((path) => path.endsWith("/seats"))).toBe(false);
  expect(screen.getByText("Table detail header")).toBeVisible();
});

it.each(["registration-changed", "leave-revoked", "booking-closed"] as const)(
  "rejects a captured leave action after %s changes",
  async (reason) => {
    if (reason === "booking-closed") {
      table = { ...table, groupType: "PUBLIC", bookingClosesAt: "2030-06-03T12:00:00Z" };
      event = { ...event, groupType: "PUBLIC" };
    }
    await render(<Fixture section="participants" />);
    await screen.findByText("@owner");
    await press("Leave table");
    const changed = {
      ...table,
      ...(reason === "registration-changed"
        ? { myRegistration: { ...roster[0], id: "66666666-6666-4666-8666-666666666666" } }
        : reason === "leave-revoked"
          ? { canLeave: false }
          : { bookingClosesAt: "2020-06-03T12:00:00Z" }),
    };
    await act(() =>
      client.setQueryData(eventRecordKeys.table(options, event.id, table.id), changed),
    );
    await press("Confirm");
    expect(writes).toHaveLength(0);
  },
);

it("prevents duplicate consent while a real registration cancellation request is pending", async () => {
  let finish: (value: Response) => void = () => {};
  pendingWrite = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture section="participants" />);
  await screen.findByText("@owner");
  await press("Leave table");
  await press("Confirm");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  await act(() => finish(json({ ...roster[0], status: "CANCELLED", version: 2, eventVersion: 2 })));
  expect(writes).toHaveLength(1);
});

it.each([undefined, "event", "table"] as const)(
  "opens the actual %s voting legend with all three meanings and the exact participation scope",
  async (scope) => {
    await installNativePopoverMeasurements();
    await render(<EventVoteLegend label="Options" scope={scope} />, {
      wrapper: NativeTestProviders,
    });
    const trigger = screen.getByRole("button", { name: "Options: Voting legend" });
    expect(screen.queryByText("Yes")).toBeNull();
    await pressMeasuredPopover(trigger);
    expect(screen.getByRole("heading", { name: "Options" })).toBeVisible();
    for (const meaning of ["Yes", "If needed", "No"])
      expect(screen.getByText(meaning)).toBeVisible();
    expect(
      screen.getByText(
        scope === "table"
          ? "You can vote only if you are an accepted participant at this table."
          : "You can vote only if you are an accepted participant in at least one table in the event.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText('Choose at least one "Yes" or "If needed" option in this category.'),
    ).toBeVisible();
    expect(screen.queryByText("Field help")).toBeNull();
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  },
);
