import {
  type NotificationAttentionTarget,
  type NotificationChangeRow,
  notificationItemId,
  type PlannedEventResponse,
  type PlannedTableResponse,
  type TableSeatResponse,
} from "@board-game-organizer/schemas";
import {
  eventRecordKeys,
  notificationChangesQuery,
  recordTablesQuery,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native";
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
import { EventTable } from "../EventTable";

const API = "https://table-owner-native.test";
const boundary = vi.hoisted(() => ({
  apiUrl: "https://table-owner-native.test",
  userId: "owner",
  getToken: vi.fn(),
  push: vi.fn(),
  dismissTo: vi.fn(),
  params: {} as { tab?: string; attention?: string },
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
  picker: { open: vi.fn(), dismiss: vi.fn() },
}));
const options = () => ({
  apiUrl: boundary.apiUrl,
  userId: boundary.userId,
  enabled: true,
  getToken: boundary.getToken,
  feedback: boundary.feedback,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: boundary.userId,
    isLoaded: true,
    isSignedIn: true,
    sessionId: `session-${boundary.userId}`,
    getToken: boundary.getToken,
  }),
}));
// Native navigation owns placement. Render only the application's actual action
// elements from the SDK header slot; the header's product components stay real.
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push, dismissTo: boundary.dismissTo }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => boundary.params,
  Stack: {
    Screen: ({ options: config }: { options: { headerRight?: () => ReactNode } }) => (
      <View testID="native-table-header-actions">{config.headerRight?.()}</View>
    ),
  },
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: boundary.picker,
}));
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let roster: TableSeatResponse[];
let tableCode: number;
let eventCode: number;
let pendingTable: Promise<Response> | undefined;
let pendingEvent: Promise<Response> | undefined;
let changes: NotificationChangeRow[];
let detailsCount: number;
let participantsCount: number;
const reads: { url: URL; authorization: string | null }[] = [];
const writes: { path: string; method: string }[] = [];
const asOf = "2030-06-01T10:00:00.000Z";
const zeros = { connections: 0, requests: 0, search: 0 };
const ownId = "44444444-4444-4444-8444-444444444444";
const guestId = "55555555-5555-4555-8555-555555555555";
const waitingId = "66666666-6666-4666-8666-666666666666";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function changesPage() {
  return {
    asOf,
    changes,
    nextCursor: null,
    tabCounts: { details: detailsCount, members: 0, tables: 0, participants: participantsCount },
  };
}
function currentRatings() {
  return {
    gameId: table.confirmed?.gameId ?? 1,
    scope: "GLOBAL",
    items: (table.confirmed?.playerIds ?? []).map((userId) => ({
      userId,
      name: `${userId} Player`,
      username: `@${userId}`,
      avatarUrl: null,
      score: 1200,
      provisional: false,
      gamesPlayed: 8,
      gamesWon: 3,
      nd: 0,
    })),
    nextCursor: null,
  };
}
function confirmTable() {
  event = {
    ...event,
    status: "CONFIRMED",
    canFinalize: true,
    confirmed: { dateId: event.dates[0].id, locationId: event.locations[0].id, at: asOf },
  };
  table = {
    ...table,
    eventStatus: "CONFIRMED",
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
    canRegister: false,
    canLeave: false,
    canInvite: false,
  };
}
function finishTable() {
  confirmTable();
  event = { ...event, status: "TERMINATED", canFinalize: false };
  table = {
    ...table,
    eventStatus: "TERMINATED",
    results: {
      lowerWins: false,
      entries: [
        { userId: "owner", score: "20", rank: 1 },
        { userId: "guest", score: "10", rank: 2 },
      ],
      tieBreaks: [],
      finalizedAt: asOf,
    },
    resultProfiles: [
      { userId: "owner", name: "Owner Player", username: "owner", email: null, avatarUrl: null },
      { userId: "guest", name: "Guest Player", username: "guest", email: null, avatarUrl: null },
    ],
  };
}
beforeEach(async () => {
  vi.clearAllMocks();
  boundary.apiUrl = API;
  boundary.userId = "owner";
  boundary.params = {};
  boundary.getToken.mockImplementation(async () => `fixture-${boundary.userId}`);
  tableCode = eventCode = 200;
  pendingTable = pendingEvent = undefined;
  changes = [];
  detailsCount = participantsCount = 0;
  reads.length = writes.length = 0;
  roster = [
    { ...seat("owner"), id: ownId, seatIndex: 0 },
    { ...seat("guest"), id: guestId, seatIndex: 1, sequence: 2 },
    { ...seat("queued"), id: waitingId, position: "WAITING", seatIndex: null, sequence: 3 },
  ];
  event = {
    ...plannedEvent,
    canManage: true,
    managementRole: "admin",
    tableCount: 2,
    myRegistrations: [roster[0]],
  };
  table = {
    ...plannedTable,
    canManage: true,
    managementRole: "admin",
    canRegister: false,
    canLeave: true,
    canInvite: true,
    eventVersion: 1,
    myRegistration: roster[0],
    myPosition: "SEATED",
    acceptedCount: 3,
    seatedCount: 2,
    waitingCount: 1,
    occupiedSeatIndices: [0, 1],
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  await installNativePopoverMeasurements();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const path = url.pathname;
      const method = init?.method ?? "GET";
      if (url.origin !== boundary.apiUrl)
        throw new Error(`Unexpected table-owner fixture origin ${url.origin}`);
      if (method !== "GET") {
        writes.push({ path, method });
        throw new Error(`Unexpected unconsented fixture write ${method} ${path}`);
      }
      reads.push({ url, authorization: new Headers(init?.headers).get("authorization") });
      if (path === `/api/events/${event.id}`)
        return (
          pendingEvent ??
          json(eventCode === 200 ? event : { error: "Fixture event denied" }, eventCode)
        );
      if (path === `/api/events/${event.id}/tables/${table.id}`)
        return (
          pendingTable ??
          json(tableCode === 200 ? table : { error: "Fixture table unavailable" }, tableCode)
        );
      if (path.endsWith("/seats/order"))
        return json({
          version: 1,
          allocationKey: "table-owner-fixture",
          capacity: 4,
          seatedCount: 2,
          registrations: roster,
        });
      if (path.endsWith("/seats"))
        return json({
          items: url.searchParams.get("pending") === "true" ? [] : roster,
          nextCursor: null,
        });
      if (path.endsWith("/leaderboard")) return json(currentRatings());
      if (path === `/api/events/${event.id}/tables`)
        return json({ items: [table], nextCursor: null });
      if (path === "/api/notifications/changes") return json(changesPage());
      if (path === "/api/notifications/attention") {
        const targets = JSON.parse(
          url.searchParams.get("targets") ?? "[]",
        ) as NotificationAttentionTarget[];
        return json({
          asOf,
          unreadCount: detailsCount + participantsCount,
          summary: {
            tables: detailsCount + participantsCount,
            events: 0,
            groups: 0,
            contacts: 0,
            sections: zeros,
          },
          targets: targets.map((target) => {
            const count =
              target.kind === "table"
                ? detailsCount + participantsCount
                : target.kind === "item" &&
                    target.id === notificationItemId(table.id, "invitation", undefined, "table")
                  ? participantsCount
                  : target.kind === "item" && target.id === notificationItemId(table.id, "games")
                    ? detailsCount
                    : 0;
            return { target, count, direct: 0, events: 0, sections: zeros };
          }),
        });
      }
      throw new Error(`Unexpected table-owner fixture path ${path}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture(props: Partial<ComponentProps<typeof EventTable>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventTable eventId={event.id} tableId={table.id} {...props} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function select(name: "overview" | "participants" | "results") {
  await userEvent.setup().press(await screen.findByTestId(`table-${name}-tab`));
}
async function ready() {
  await screen.findByTestId("table-overview-tab");
  await waitFor(() => expect(client.isFetching()).toBe(0));
}
const seatReads = () => reads.filter(({ url }) => url.pathname.endsWith("/seats"));

it("loads the actual planning owner with complete detail artwork, real tabs and separate consent actions", async () => {
  await render(<Fixture />);
  await ready();
  expect(screen.getByTestId("table-overview-tab")).toBeSelected();
  expect(screen.getByRole("header", { name: table.name })).toBeVisible();
  expect(screen.getByText("Chess")).toBeVisible();
  expect(screen.getByTestId("table-participants-tab")).toBe(
    screen.getByRole("tab", { name: "Participants" }),
  );
  expect(screen.queryByTestId("table-results-tab")).toBeNull();
  expect(screen.getByRole("button", { name: "Delete table" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Register result" })).toBeNull();
  expect(writes).toHaveLength(0);
});

it("retains real participant and overview hosts across repeated cached top-tab changes without rereading the roster", async () => {
  await render(<Fixture />);
  await ready();
  const game = screen.getByText("Chess");
  await select("participants");
  const person = await screen.findByText("@guest");
  expect(screen.getByText("@queued")).toBeVisible();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  const baseline = seatReads().length;
  for (let cycle = 0; cycle < 3; cycle++) {
    await select("overview");
    expect(screen.getByText("Chess")).toBe(game);
    expect(screen.queryByText("@guest")).toBeNull();
    expect(screen.getByText("@guest", { includeHiddenElements: true })).toBe(person);
    await select("participants");
    expect(screen.getByText("@guest")).toBe(person);
  }
  expect(seatReads()).toHaveLength(baseline);
  expect(writes).toHaveLength(0);
});

it("keeps unsaved seat ordering through a Details/Participants cycle and leaves the server untouched until save", async () => {
  await render(<Fixture />);
  await ready();
  await select("participants");
  await userEvent.setup().press(await screen.findByRole("button", { name: "Reorder seats" }));
  await screen.findByTestId("seat-order-list");
  await userEvent.setup().press(screen.getByTestId(`seat-order-down-${ownId}`));
  const edited = screen.getByTestId(`seat-order-row-${ownId}`);
  await select("overview");
  expect(screen.queryByTestId("seat-order-list")).toBeNull();
  await select("participants");
  expect(screen.getByTestId(`seat-order-row-${ownId}`)).toBe(edited);
  expect(screen.getByTestId("seat-order-save")).toBeEnabled();
  expect(writes).toHaveLength(0);
  await userEvent.setup().press(screen.getByTestId("seat-order-discard"));
  expect(screen.queryByTestId("seat-order-list")).toBeNull();
  expect(writes).toHaveLength(0);
});

it("updates a retained hidden overview and roster from fresh authoritative server snapshots", async () => {
  await render(<Fixture />);
  await ready();
  await select("participants");
  await screen.findByText("@guest");
  await select("overview");
  const seatsKey = [...eventRecordKeys.root(options()), "seats", event.id, table.id, false, ""];
  await act(() => {
    client.setQueryData(eventRecordKeys.table(options(), event.id, table.id), {
      ...table,
      name: "Current server table",
      gamesDetail: [{ ...table.gamesDetail[0], name: "Current server game" }],
    });
    client.setQueryData(seatsKey, {
      pages: [
        {
          items: roster.map((row) =>
            row.userId === "guest" ? { ...row, username: "new-guest-handle" } : row,
          ),
          nextCursor: null,
        },
      ],
      pageParams: [""],
    });
  });
  expect(screen.getByRole("header", { name: "Current server table" })).toBeVisible();
  expect(screen.getByText("Current server game")).toBeVisible();
  await select("participants");
  expect(screen.getByText("@new-guest-handle")).toBeVisible();
  expect(screen.queryByText("@guest")).toBeNull();
  expect(writes).toHaveLength(0);
});

it.each(["tab", "invitation"] as const)(
  "opens the real participants view for a validated %s continuation without acknowledging attention",
  async (source) => {
    boundary.params =
      source === "tab"
        ? { tab: "participants" }
        : { attention: notificationItemId(table.id, "invitation", undefined, "table") };
    await render(<Fixture />);
    expect(await screen.findByText("@owner")).toBeVisible();
    expect(screen.getByTestId("table-participants-tab")).toBeSelected();
    expect(writes).toHaveLength(0);
  },
);

it("ignores an unrelated attention/unknown initial tab and starts from safe Details", async () => {
  boundary.params = { tab: "invalid", attention: notificationItemId(event.id, "overview") };
  await render(<Fixture />);
  await ready();
  expect(screen.getByTestId("table-overview-tab")).toBeSelected();
  expect(screen.queryByText("@owner")).toBeNull();
});

it("keeps unread details and participant indicators independent of visits and displays exact source change text", async () => {
  detailsCount = participantsCount = 1;
  const reference = { notificationId: "000000000000000000000001", effectiveAt: asOf };
  changes = [
    {
      ...reference,
      messageCode: "games",
      title: "Game choices changed",
      description: "È cambiata la città scelta.",
      requiresResponse: false,
      readReference: reference,
    },
  ];
  await render(<Fixture />);
  await ready();
  expect(
    within(screen.getByTestId("table-overview-tab")).getByLabelText("Needs attention"),
  ).toBeVisible();
  expect(
    within(screen.getByTestId("table-participants-tab")).getByLabelText("Needs attention"),
  ).toBeVisible();
  await select("participants");
  await select("overview");
  await pressMeasuredPopover(screen.getByRole("button", { name: "New changes" }));
  expect(screen.getByText("È cambiata la città scelta.")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("reconciles supplied tab counts from an ordinary source snapshot without interpreting entry as read consent", async () => {
  detailsCount = participantsCount = 1;
  await render(<Fixture />);
  await ready();
  const key = notificationChangesQuery(
    { ...options(), locale: "en" },
    { kind: "table", id: table.id, tab: "all" },
  ).queryKey;
  detailsCount = 0;
  // A newer ordinary server snapshot reconciles the badges; visiting a tab
  // does not fabricate the explicit read receipt or issue a mutation.
  await act(async () => {
    await Promise.all([
      client.refetchQueries({ queryKey: key, exact: true }),
      client.refetchQueries({
        queryKey: ["notification-attention", boundary.apiUrl, boundary.userId],
      }),
    ]);
  });
  await waitFor(() =>
    expect(
      within(screen.getByTestId("table-overview-tab")).queryByLabelText("Needs attention"),
    ).toBeNull(),
  );
  expect(
    within(screen.getByTestId("table-participants-tab")).getByLabelText("Needs attention"),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("mounts current results on first visit and retains the same cached result rows on reentry", async () => {
  confirmTable();
  await render(<Fixture />);
  await ready();
  await select("participants");
  const participant = await screen.findByText("@guest");
  await select("results");
  const result = await screen.findByText("@guest");
  expect(screen.getByTestId("table-results-tab")).toBeSelected();
  await select("participants");
  expect(screen.getByText("@guest")).toBe(participant);
  await select("results");
  expect(screen.getByText("@guest")).toBe(result);
  expect(writes).toHaveLength(0);
});

it("shows frozen terminated standings while keeping canonical historical profile/rank information", async () => {
  finishTable();
  await render(<Fixture />);
  await ready();
  await select("results");
  expect(screen.getByLabelText("Score: 20")).toBeVisible();
  expect(screen.getByRole("button", { name: "Position: #1" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Register result" })).toBeNull();
  expect(reads.filter(({ url }) => url.pathname.endsWith("/leaderboard"))).toHaveLength(0);
});

it("falls back to Details when a selected Results panel becomes a planning table after an authoritative replan", async () => {
  confirmTable();
  await render(<Fixture />);
  await ready();
  await select("results");
  await screen.findByText("@owner");
  await act(() => {
    client.setQueryData(eventRecordKeys.table(options(), event.id, table.id), {
      ...table,
      eventStatus: "PLANNING",
      confirmed: undefined,
    });
    client.setQueryData(eventRecordKeys.detail(options(), event.id), {
      ...event,
      status: "PLANNING",
      confirmed: undefined,
      canFinalize: false,
    });
  });
  expect(screen.queryByTestId("table-results-tab")).toBeNull();
  expect(screen.getByTestId("table-overview-tab")).toBeSelected();
});

it("exposes the real result-header action only to current managers of an included confirmed table", async () => {
  confirmTable();
  await render(<Fixture />);
  await ready();
  const action = screen.getByRole("button", { name: "Register result" });
  expect(action).toHaveStyle({ minWidth: 44, minHeight: 44 });
  await userEvent.setup().press(action);
  expect(boundary.push).toHaveBeenCalledWith({
    pathname: "/event/results",
    params: { eventId: event.id, tableId: table.id },
  });
  expect(writes).toHaveLength(0);
});

it.each(["capability", "role", "excluded", "read-only"] as const)(
  "withholds result registration when the %s projection does not authorize it",
  async (reason) => {
    confirmTable();
    if (reason === "capability") event = { ...event, canFinalize: false };
    else if (reason === "role") event = { ...event, canManage: false, managementRole: null };
    else if (reason === "excluded") table = { ...table, confirmed: undefined };
    else table = { ...table, readOnly: true };
    await render(<Fixture />);
    await ready();
    expect(screen.queryByRole("button", { name: "Register result" })).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it("keeps the register-result action disabled for a partial list placeholder until a real detail response arrives", async () => {
  confirmTable();
  const list = recordTablesQuery(options(), null);
  client.setQueryData(list.queryKey, {
    pages: [{ items: [table], nextCursor: null }],
    pageParams: [""],
  });
  client.setQueryData(eventRecordKeys.detail(options(), event.id), event);
  let finish: (value: Response) => void = () => {};
  pendingTable = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(await screen.findByRole("button", { name: "Register result" })).toBeDisabled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Register result" }));
  expect(boundary.push).not.toHaveBeenCalled();
  pendingTable = undefined;
  await act(() => finish(json(table)));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Register result" })).toBeEnabled(),
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Register result" }));
  expect(boundary.push).toHaveBeenCalledWith({
    pathname: "/event/results",
    params: { eventId: event.id, tableId: table.id },
  });
});

it("keeps a shared-results-only owner free of participants, manager actions and unread-source affordances", async () => {
  finishTable();
  event = {
    ...event,
    readOnly: true,
    canManage: false,
    managementRole: null,
    canFinalize: false,
    myRegistrations: [],
  };
  table = {
    ...table,
    readOnly: true,
    sharedResultsOnly: true,
    canManage: false,
    managementRole: null,
    myRegistration: null,
  };
  boundary.params = { tab: "participants" };
  await render(<Fixture />);
  await ready();
  expect(screen.getByTestId("table-overview-tab")).toBeSelected();
  expect(screen.queryByTestId("table-participants-tab")).toBeNull();
  expect(screen.queryByRole("button", { name: "New changes" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete table" })).toBeNull();
  expect(reads.filter(({ url }) => url.pathname === "/api/notifications/changes")).toHaveLength(0);
  await select("results");
  expect(screen.getByLabelText("Score: 20")).toBeVisible();
});

it("retains a known detail failure on another active tab and recovers without replacing cached roster rows", async () => {
  await render(<Fixture />);
  await ready();
  await select("participants");
  const person = await screen.findByText("@guest");
  tableCode = 503;
  await act(() =>
    client.invalidateQueries({
      queryKey: eventRecordKeys.table(options(), event.id, table.id),
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not load complete table details")).toBeVisible();
  expect(screen.getByText("@guest")).toBe(person);
  tableCode = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.queryByText("Could not load complete table details")).toBeNull(),
  );
});

it.each(["table", "event"] as const)(
  "revokes every retained private view when the authoritative %s request denies access",
  async (source) => {
    await render(<Fixture />);
    await ready();
    await select("participants");
    await screen.findByText("@guest");
    if (source === "table") tableCode = 403;
    else eventCode = 403;
    await act(() =>
      client.invalidateQueries({
        queryKey:
          source === "table"
            ? eventRecordKeys.table(options(), event.id, table.id)
            : eventRecordKeys.detail(options(), event.id),
        exact: true,
      }),
    );
    expect(await screen.findByText("Could not load table")).toBeVisible();
    expect(screen.queryByText("@guest", { includeHiddenElements: true })).toBeNull();
    expect(
      screen.queryByTestId("table-participants-tab", { includeHiddenElements: true }),
    ).toBeNull();
  },
);

it("keeps a first detail request pending without reporting an empty or unauthorized table", async () => {
  let finish: (value: Response) => void = () => {};
  pendingTable = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText("Could not load table")).toBeNull();
  expect(screen.queryByTestId("table-overview-tab")).toBeNull();
  pendingTable = undefined;
  await act(() => finish(json(table)));
  await ready();
});

it("opens the real table invitation navigation only after the manager selects a free-place action", async () => {
  await render(<Fixture />);
  await ready();
  await select("participants");
  const places = await screen.findAllByRole("button", { name: /^Free place/ });
  expect(places).toHaveLength(2);
  expect(places[0]).toBeEnabled();
  expect(places[1]).toBeDisabled();
  await userEvent.setup().press(places[0]);
  expect(screen.getByText("Join this table yourself or invite another player.")).toBeVisible();
  expect(boundary.push).not.toHaveBeenCalled();
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Invite players",
    }),
  );
  expect(boundary.push).toHaveBeenCalledWith({
    pathname: "/event/invite",
    params: { eventId: event.id, tableId: table.id },
  });
  expect(writes).toHaveLength(0);
});

it("drops all cached private panes when the authenticated owner/API changes", async () => {
  const view = await render(<Fixture />);
  await ready();
  await select("participants");
  const old = screen.getByText("@guest");
  boundary.userId = "second-owner";
  boundary.apiUrl = "https://second-table-owner.test";
  roster = [{ ...seat("second-owner"), id: ownId, seatIndex: 0 }];
  table = {
    ...table,
    name: "Other account table",
    myRegistration: roster[0],
    seatedCount: 1,
    acceptedCount: 1,
    occupiedSeatIndices: [0],
    waitingCount: 0,
    canManage: false,
    canInvite: false,
    managementRole: null,
  };
  event = { ...event, canManage: false, managementRole: null, myRegistrations: [roster[0]] };
  await view.rerender(<Fixture />);
  expect(screen.queryByText("@guest", { includeHiddenElements: true })).toBeNull();
  expect(await screen.findByText("@second-owner")).toBeVisible();
  expect(screen.getByText("@second-owner")).not.toBe(old);
  expect(reads.at(-1)?.authorization).toBe("Bearer fixture-second-owner");
  expect(writes).toHaveLength(0);
});
