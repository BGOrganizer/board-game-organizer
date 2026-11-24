import { URL } from "node:url";
import type {
  EventParticipantResponse,
  NotificationAttentionTarget,
  NotificationChangeRow,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  eventRecordKeys,
  notificationChangesQuery,
  recordTablesQuery,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { type ComponentProps, createContext, type ReactNode, useContext } from "react";
import { View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EventScreen from "@/app/event/[eventId]";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import {
  plannedEvent,
  plannedTable,
  seat,
} from "../../../../../web/src/test-fixtures/eventRecords";
import type { EventDetail } from "../EventDetail";

const RouteParams = createContext<Partial<ComponentProps<typeof EventDetail>>>({});

const API = "https://event-detail-owner-native.test";
const boundary = vi.hoisted(() => ({
  apiUrl: "https://event-detail-owner-native.test",
  userId: "owner",
  push: vi.fn(),
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
}));
const options = () => ({
  apiUrl: boundary.apiUrl,
  userId: boundary.userId,
  getToken: async () => `fixture-${boundary.userId}`,
  enabled: true,
  feedback: boundary.feedback,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: boundary.userId,
    isLoaded: true,
    isSignedIn: true,
    sessionId: `fixture-${boundary.userId}`,
    getToken: options().getToken,
  }),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => useContext(RouteParams),
  Stack: {
    Screen: ({ options: config }: { options: { headerRight?: () => ReactNode } }) => (
      <View testID="event-native-header-actions">{config.headerRight?.()}</View>
    ),
  },
}));
let client: QueryClient;
let event: PlannedEventResponse;
let tables: PlannedTableResponse[];
let participants: EventParticipantResponse[];
let changes: NotificationChangeRow[];
let tabCounts: { details: number; participants: number; tables: number; members: number };
let eventCode: number;
let tablesCode: number;
let nextTablesCode: number;
let tablesCursor: string | null;
let nextTables: PlannedTableResponse[];
let pendingEvent: Promise<Response> | undefined;
let pendingTables: Promise<Response> | undefined;
const asOf = "2030-06-01T12:00:00.000Z";
const zeros = { connections: 0, requests: 0, search: 0 };
const reads: URL[] = [];
const writes: { path: string; method: string; input: Record<string, unknown> }[] = [];
const json = (value: unknown, status = 200) => Response.json(value, { status });
function confirmable() {
  event = {
    ...event,
    canConfirm: true,
    agreement: {
      agreed: true,
      dateId: event.dates[0].id,
      locationId: event.locations[0].id,
      tables: [{ tableId: plannedTable.id, gameId: 1, participantIds: ["owner", "guest"] }],
      reasons: [],
    },
  };
}
function confirmed() {
  event = {
    ...event,
    status: "CONFIRMED",
    canEdit: false,
    canConfirm: false,
    canReplan: true,
    canFinalize: true,
    confirmed: { dateId: event.dates[0].id, locationId: event.locations[0].id, at: asOf },
  };
  tables = tables.map((table) => ({
    ...table,
    eventStatus: "CONFIRMED",
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  }));
}
beforeEach(async () => {
  vi.clearAllMocks();
  boundary.apiUrl = API;
  boundary.userId = "owner";
  event = { ...plannedEvent, canManage: true, managementRole: "admin" };
  tables = [{ ...plannedTable, canManage: true, managementRole: "admin" }];
  participants = [
    {
      id: "guest",
      userId: "guest",
      name: "Guest Player",
      username: "guest",
      avatarUrl: null,
      position: "SEATED",
      accepted: true,
      pendingInvitation: false,
      waiting: false,
      demonstrator: false,
      managementRole: null,
      canRemove: true,
      canBanGroup: false,
    },
  ];
  changes = [];
  tabCounts = { details: 0, participants: 0, tables: 0, members: 0 };
  eventCode = tablesCode = nextTablesCode = 200;
  tablesCursor = null;
  nextTables = [];
  pendingEvent = pendingTables = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  await installNativePopoverMeasurements();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== boundary.apiUrl)
        throw new Error(`Unexpected event fixture origin ${url.origin}`);
      const method = init?.method ?? "GET",
        path = url.pathname;
      if (method !== "GET") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        writes.push({ path, method, input: body });
        if (path === `/api/events/${event.id}/state` && method === "PATCH") {
          if (body.action === "confirm") confirmed();
          else if (body.action === "replan") {
            event = {
              ...event,
              status: "PLANNING",
              confirmed: undefined,
              canEdit: true,
              canReplan: false,
            };
          } else throw new Error("Unexpected event transition");
          event = { ...event, version: event.version + 1 };
          return json(event);
        }
        if (path === `/api/events/${event.id}/votes` && method === "PATCH") {
          if (
            (body.kind === "date" || body.kind === "location") &&
            typeof body.optionId === "string" &&
            (body.vote === "YES" || body.vote === "NO" || body.vote === "IF_NEEDED")
          ) {
            const field = body.kind === "date" ? "dateVotes" : "locationVotes";
            event = {
              ...event,
              version: event.version + 1,
              myVotes: {
                dateVotes: { ...event.myVotes?.dateVotes },
                locationVotes: { ...event.myVotes?.locationVotes },
                [field]: { ...event.myVotes?.[field], [body.optionId]: body.vote },
              },
            };
          }
          return json(event);
        }
        throw new Error(`Unexpected unconsented event write ${method} ${path}`);
      }
      reads.push(url);
      if (path === `/api/events/${event.id}`)
        return (
          pendingEvent ??
          json(eventCode === 200 ? event : { error: "Fixture event unavailable" }, eventCode)
        );
      if (path === `/api/events/${event.id}/tables`) {
        const next = url.searchParams.has("cursor");
        const code = next ? nextTablesCode : tablesCode;
        return (
          (next ? undefined : pendingTables) ??
          json(
            code === 200
              ? { items: next ? nextTables : tables, nextCursor: next ? null : tablesCursor }
              : { error: "Fixture tables unavailable" },
            code,
          )
        );
      }
      if (path === `/api/events/${event.id}/participants`)
        return json({
          items: participants,
          nextCursor: null,
          eventVersion: event.version,
          groupId: event.groupId,
          status: event.status,
        });
      if (path === "/api/notifications/changes")
        return json({ asOf, changes, nextCursor: null, tabCounts });
      if (path === "/api/notifications/attention") {
        const targets = JSON.parse(
          url.searchParams.get("targets") ?? "[]",
        ) as NotificationAttentionTarget[];
        const count = tabCounts.details + tabCounts.participants + tabCounts.tables;
        return json({
          asOf,
          unreadCount: count,
          summary: { tables: 0, events: count, groups: 0, contacts: 0, sections: zeros },
          targets: targets.map((target) => ({
            target,
            count: target.kind === "event" ? count : 0,
            direct: 0,
            events: 0,
            sections: zeros,
          })),
        });
      }
      throw new Error(`Unexpected event fixture GET ${path}`);
    }),
  );
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture(props: Partial<ComponentProps<typeof EventDetail>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <RouteParams value={{ eventId: event.id, ...props }}>
          <EventScreen />
        </RouteParams>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function ready() {
  await screen.findByRole("header", { name: event.name });
  await waitFor(() => expect(client.isFetching()).toBe(0));
}
// A passive attention badge contributes its accessible label to the tab's name.
// Match that exact optional suffix rather than hiding it or bypassing accessibility.
function tabName(name: "Details" | "Tables" | "Participants") {
  return new RegExp(`^${name}(?: Needs attention)?$`);
}
async function select(name: "Details" | "Tables" | "Participants") {
  await userEvent.setup().press(await screen.findByRole("tab", { name: tabName(name) }));
  expect(screen.getByRole("tab", { name: tabName(name) })).toBeSelected();
}
async function press(name: string | RegExp) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
async function dialog(name: string) {
  await userEvent
    .setup()
    .press(within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name }));
}
async function snapshot(next: PlannedEventResponse) {
  event = next;
  await act(() => client.setQueryData(eventRecordKeys.detail(options(), event.id), event));
  await screen.findByRole("header", { name: event.name });
}

it("keeps an unresolved uncached owner distinct from an error and then exposes current event actions", async () => {
  let finish: (value: Response) => void = () => {};
  pendingEvent = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText("Could not load event")).toBeNull();
  expect(screen.queryByRole("tab")).toBeNull();
  await act(() => finish(json(event)));
  await ready();
  expect(screen.getByRole("button", { name: "Edit event" })).toBeEnabled();
  expect(writes).toHaveLength(0);
});

it("keeps an uncached read failure observable and retries the real detail query explicitly", async () => {
  eventCode = 503;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load event")).toBeVisible();
  eventCode = 200;
  await press("Try again");
  await ready();
  expect(reads.filter(({ pathname }) => pathname === `/api/events/${event.id}`)).toHaveLength(2);
});

it("retains actual details, tables and participant rows on reentry while server updates remain reactive", async () => {
  await render(<Fixture />);
  await ready();
  const dates = screen.getByText("Dates and times");
  await select("Tables");
  const tableName = await screen.findByText("Table #1");
  await select("Participants");
  const guest = await screen.findByText("@guest");
  await select("Details");
  expect(screen.getByText("Dates and times")).toBe(dates);
  await select("Tables");
  expect(screen.getByText("Table #1")).toBe(tableName);
  await select("Participants");
  expect(screen.getByText("@guest")).toBe(guest);
  const source = reads.filter(({ pathname }) => pathname.endsWith("/participants")).length;
  participants = [{ ...participants[0], username: "updated-guest" }];
  await act(() =>
    client.invalidateQueries({
      queryKey: ["events", boundary.apiUrl, boundary.userId, "participants", event.id],
    }),
  );
  expect(await screen.findByText("@updated-guest")).toBeVisible();
  expect(screen.queryByText("@guest")).toBeNull();
  expect(reads.filter(({ pathname }) => pathname.endsWith("/participants"))).toHaveLength(
    source + 1,
  );
  expect(writes).toHaveLength(0);
});

it("preserves cached content after an ordinary refresh failure and removes private details after real denial", async () => {
  await render(<Fixture />);
  await ready();
  eventCode = 503;
  await act(() =>
    client.invalidateQueries({
      queryKey: eventRecordKeys.detail(options(), event.id),
      exact: true,
    }),
  );
  expect(screen.getByRole("header", { name: event.name })).toBeVisible();
  expect(client.getQueryState(eventRecordKeys.detail(options(), event.id))?.status).toBe("error");
  eventCode = 403;
  await act(() =>
    client.invalidateQueries({
      queryKey: eventRecordKeys.detail(options(), event.id),
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not load event")).toBeVisible();
  expect(screen.queryByText("Dates and times", { includeHiddenElements: true })).toBeNull();
});

it("shows no premature empty-state while the real tables query is pending, then shows genuine emptiness", async () => {
  let finish: (value: Response) => void = () => {};
  pendingTables = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await screen.findByRole("header", { name: event.name });
  await select("Tables");
  expect(screen.queryByText("No tables found")).toBeNull();
  await act(() => finish(json({ items: [], nextCursor: null })));
  expect(await screen.findByText("No tables found")).toBeVisible();
});

it("keeps failed tables distinct from emptiness and retries only that source on explicit recovery", async () => {
  tablesCode = 503;
  await render(<Fixture />);
  await ready();
  await select("Tables");
  expect(await screen.findByText("Could not load tables")).toBeVisible();
  expect(screen.queryByText("No tables found")).toBeNull();
  tablesCode = 200;
  await press("Try again");
  expect(await screen.findByText("Table #1")).toBeVisible();
});

it("reveals cached tables by explicit paging and resets only presentation on departure while preserving authoritative pages", async () => {
  const second = {
    ...tables[0],
    id: "55555555-5555-4555-8555-555555555555",
    order: 1,
  };
  const key = recordTablesQuery(options(), event.id).queryKey;
  const cache = {
    pages: [
      { items: tables, nextCursor: "next" },
      { items: [second], nextCursor: null },
    ],
    pageParams: ["", "next"],
  };
  client.setQueryData(key, cache);
  await render(<Fixture />);
  await ready();
  await select("Tables");
  expect(screen.getByText("Table #1")).toBeVisible();
  expect(screen.queryByText("Table #2")).toBeNull();
  await press("Load more");
  expect(await screen.findByText("Table #2")).toBeVisible();
  await select("Details");
  await select("Tables");
  expect(screen.queryByText("Table #2")).toBeNull();
  expect(screen.getByText("Table #1")).toBeVisible();
  expect(client.getQueryData(key)).toBe(cache);
  expect(reads.some(({ searchParams }) => searchParams.has("cursor"))).toBe(false);
});

it.each(["personalAccessOnly", "sharedResultsOnly"] as const)(
  "revokes a retained participant subtree when the source becomes %s",
  async (scope) => {
    await render(<Fixture />);
    await ready();
    await select("Participants");
    await screen.findByText("@guest");
    await snapshot({
      ...event,
      name: "Restricted authoritative event",
      readOnly: true,
      canManage: false,
      canEdit: false,
      [scope]: true,
    });
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Participants" })).toBeNull());
    expect(screen.getByRole("tab", { name: "Details" })).toBeSelected();
    expect(screen.queryByText("@guest", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "New changes" })).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it.each([
  { scope: "personalAccessOnly", text: "Personal access to your table. Group details are hidden." },
  { scope: "sharedResultsOnly", text: "Shared finalized results. Group details are hidden." },
])(
  "explains the authorized read-only $scope projection without loading privileged notices",
  async ({ scope, text }) => {
    event = { ...event, readOnly: true, canManage: false, canEdit: false, [scope]: true };
    await render(<Fixture />);
    await ready();
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit event" })).toBeNull();
    expect(reads.some(({ pathname }) => pathname === "/api/notifications/changes")).toBe(false);
  },
);

it("explains public read-only participation without issuing a private participants request", async () => {
  event = {
    ...event,
    groupType: "PUBLIC",
    visibility: "PUBLIC",
    readOnly: true,
    canManage: false,
    canEdit: false,
  };
  await render(<Fixture />);
  await ready();
  await select("Participants");
  expect(
    screen.getByText("Public event. Group membership is not required to participate."),
  ).toBeVisible();
  expect(reads.some(({ pathname }) => pathname.endsWith("/participants"))).toBe(false);
});

it("keeps public start/end/registration deadlines visible with their actual localized categories", async () => {
  event = {
    ...event,
    groupType: "PUBLIC",
    visibility: "PUBLIC",
    endsAt: "2030-06-03T22:00:00Z",
    bookingClosesAt: "2030-06-02T20:00:00Z",
  };
  await render(<Fixture />);
  await ready();
  expect(screen.getByText("Start Date and Time")).toBeVisible();
  expect(screen.getByText("End Date and Time")).toBeVisible();
  expect(screen.getByText("Registration Deadline Date and Time")).toBeVisible();
});

it("preserves group continuation in edit navigation and omits its redundant parent-group link", async () => {
  event = {
    ...event,
    groupId: "66666666-6666-4666-8666-666666666666",
    groupName: "Parent group",
    groupType: "PRIVATE",
  };
  await render(<Fixture fromGroup={event.groupId ?? undefined} />);
  await ready();
  await press("Edit event");
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/event/wizard",
    params: { eventId: event.id, fromGroup: event.groupId },
  });
  expect(screen.queryByRole("button", { name: "Open group: Parent group" })).toBeNull();
});

it("keeps blocked confirmation explanatory rather than fabricating consent or state changes", async () => {
  await render(<Fixture />);
  await ready();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Confirm event" }));
  expect(
    screen.getByText(
      "No complete agreement yet. Check participation and votes for the date, location and game.",
    ),
  ).toBeVisible();
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(writes).toHaveLength(0);
});

it("confirms only after separate explicit consent using the exact current event version", async () => {
  confirmable();
  await render(<Fixture />);
  await ready();
  await press("Confirm event");
  expect(
    screen.getByText(
      "Only agreed tables and accepted players are frozen. Other tables and invitations are retained but excluded.",
    ),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await dialog("Cancel");
  expect(writes).toHaveLength(0);
  await press("Confirm event");
  await dialog("Confirm");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    path: `/api/events/${event.id}/state`,
    method: "PATCH",
    input: { action: "confirm", version: 1 },
  });
  expect(await screen.findByRole("button", { name: "Reopen planning" })).toBeVisible();
});

it("rejects a captured confirmation after a newer event version arrives through the canonical query", async () => {
  confirmable();
  await render(<Fixture />);
  await ready();
  await press("Confirm event");
  await snapshot({ ...event, version: 2, name: "Updated event before confirmation" });
  await dialog("Confirm");
  expect(screen.getByText("Could not change event state. Refresh and try again.")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("requires separate explicit reopening consent and retains votes while moving a confirmed event back to planning", async () => {
  confirmed();
  await render(<Fixture />);
  await ready();
  await press("Reopen planning");
  expect(
    screen.getByText(
      "Votes, invitations and waiting priorities are retained. The booking cutoff is not extended. Confirming again discards saved provisional scores.",
    ),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await dialog("Confirm");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toEqual({ action: "replan", version: 1 });
  expect(await screen.findByRole("button", { name: "Edit event" })).toBeVisible();
});

it.each(["date", "location"] as const)(
  "protects the last positive %s vote and sends only an explicit permitted preference",
  async (kind) => {
    const other = "77777777-7777-4777-8777-777777777777";
    const registration = seat("owner");
    event = {
      ...event,
      canVote: true,
      myRegistrations: [registration],
      dates: [...event.dates, { id: other, day: "2030-06-04" }],
      locations: [...event.locations, { ...event.locations[0], id: other, name: "Other venue" }],
      myVotes: {
        dateVotes: { [event.dates[0].id]: "YES", [other]: "NO" },
        locationVotes: { [event.locations[0].id]: "YES", [other]: "NO" },
      },
    };
    await render(<Fixture />);
    await ready();
    const name = kind === "date" ? "2030-06-03 20:00: Yes" : "Club venue: Yes";
    await press(name);
    const choices = within(screen.getByTestId("confirmation-dialog"));
    expect(choices.getByRole("button", { name: "No" })).toBeDisabled();
    await userEvent.setup().press(choices.getByRole("button", { name: "No" }));
    expect(writes).toHaveLength(0);
    await userEvent.setup().press(choices.getByRole("button", { name: "If needed" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].input).toEqual({
      kind,
      optionId: plannedEvent.dates[0].id,
      vote: "IF_NEEDED",
    });
  },
);

it.each(["date", "location"] as const)(
  "offers No on a changed singleton %s and saves the explicit preference",
  async (kind) => {
    const option = kind === "date" ? event.dates[0] : event.locations[0];
    const label = kind === "date" ? "2030-06-03 20:00" : "Club venue";
    event = {
      ...event,
      canVote: true,
      myRegistrations: [seat("owner")],
      [`${kind}VoteRequired`]: true,
    };
    await render(<Fixture />);
    await press(`${label}: Choose your vote`);
    const button = within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "No",
    });
    expect(button).toBeEnabled();
    await userEvent.setup().press(button);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].input).toEqual({ kind, optionId: option.id, vote: "NO" });
  },
);

it("shows named votes and the breakdown action only for each eligible Event category", async () => {
  const voter = { userId: "voter", name: "Voter Alice", username: null, avatarUrl: null };
  const firstDate = event.dates[0].id;
  const firstVenue = event.locations[0].id;
  const named = { YES: [voter], IF_NEEDED: [], NO: [] };
  const withHandle = { ...named, YES: [{ ...voter, username: "alice" }] };
  event = {
    ...event,
    canManage: true,
    canVote: false,
    dates: [...event.dates, { id: "other-date", day: "2030-06-05" }],
    voteVoters: { dates: { [firstDate]: named }, locations: { [firstVenue]: withHandle } },
  };
  await render(<Fixture />);
  await ready();
  expect(screen.queryByLabelText("Votes: 2030-06-03 20:00")).toBeNull();
  await press("Vote summary: 2030-06-03 20:00");
  expect(screen.getByLabelText("Votes: 2030-06-03 20:00")).toBeVisible();
  expect(screen.queryByLabelText("Votes: Club venue")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Vote summary: Club venue/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Club venue: Show votes" })).toBeNull();
  await press("2030-06-03 20:00: Show votes");
  const hidden = { includeHiddenElements: true };
  expect(await screen.findByText("Username unavailable", hidden)).toBeOnTheScreen();
  expect(screen.queryByText("Voter Alice", hidden)).toBeNull();
  await userEvent.setup().press(screen.getByRole("button", { name: "Close", ...hidden }));
  await waitFor(() => expect(screen.queryByText("Username unavailable", hidden)).toBeNull());
  await snapshot({
    ...event,
    locations: [
      ...event.locations,
      { ...event.locations[0], id: "other-place", name: "Second venue" },
    ],
  });
  await press(/^Vote summary: Club venue,/);
  const venueVotes = await screen.findByLabelText("Votes: Club venue");
  expect(venueVotes).toBeVisible();
  await userEvent
    .setup()
    .press(within(venueVotes).getByRole("button", { name: "Club venue: Show votes — Yes" }));
  expect(await screen.findByText("@alice", hidden)).toBeOnTheScreen();
  expect(screen.queryByText("Voter Alice", hidden)).toBeNull();
  expect(screen.getByRole("tab", { name: "Yes", ...hidden })).toBeSelected();
  await snapshot({
    ...event,
    name: "Event after voting eligibility was revoked",
    version: event.version + 1,
    canManage: false,
    role: "invited",
    myRegistrations: [],
  });
  expect(screen.queryAllByLabelText(/^Votes:/, hidden)).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /^Vote summary:/, ...hidden })).toBeNull();
  expect(screen.queryByRole("button", { name: /Show votes/, ...hidden })).toBeNull();
  expect(screen.queryByText("@alice", hidden)).toBeNull();
  expect(screen.queryByRole("tab", { name: "Yes", ...hidden })).toBeNull();
});

it("keeps independent notice badges and exact UTF-8 descriptions without acknowledging notices on visits", async () => {
  tabCounts = { details: 1, participants: 1, tables: 1, members: 0 };
  const reference = { notificationId: "000000000000000000000001", effectiveAt: asOf };
  changes = [
    {
      ...reference,
      readReference: reference,
      messageCode: "dates",
      title: "Date changed",
      description: "La città è cambiata, così come l’orario.",
      requiresResponse: false,
    },
  ];
  await render(<Fixture />);
  await ready();
  for (const name of ["Details", "Participants", "Tables"] as const) {
    const trigger = screen.getByRole("tab", { name: tabName(name) });
    expect(trigger).toHaveAccessibleName(`${name} Needs attention`);
    expect(within(trigger).getByLabelText("Needs attention")).toBeVisible();
  }
  await select("Tables");
  await select("Details");
  await pressMeasuredPopover(screen.getByRole("button", { name: "New changes" }));
  expect(screen.getByText("La città è cambiata, così come l’orario.")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("reconciles an ordinary server tab-count snapshot without issuing a read or participation mutation", async () => {
  tabCounts.details = tabCounts.tables = 1;
  await render(<Fixture />);
  await ready();
  tabCounts = { details: 0, participants: 0, tables: 1, members: 0 };
  const key = notificationChangesQuery(
    { ...options(), locale: "en" },
    { kind: "event", id: event.id, tab: "all" },
  ).queryKey;
  await act(() => client.refetchQueries({ queryKey: key, exact: true }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("tab", { name: tabName("Details") })).queryByLabelText(
        "Needs attention",
      ),
    ).toBeNull(),
  );
  expect(
    within(screen.getByRole("tab", { name: tabName("Tables") })).getByLabelText("Needs attention"),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("explains each distinct confirmation blocker without restoring an unavailable table title", async () => {
  const second = { ...tables[0], order: 1, id: "55555555-5555-4555-8555-555555555555" };
  tables = [...tables, second];
  event = {
    ...event,
    agreement: {
      agreed: false,
      tables: [],
      reasons: [
        { tableId: tables[0].id, code: "PENDING_RESERVATIONS" },
        { tableId: second.id, code: "GAME_DISAGREEMENT" },
        { tableId: "77777777-7777-4777-8777-777777777777", code: "NO_COMPATIBLE_PLAYERS" },
      ],
    },
  };
  await render(<Fixture />);
  await ready();
  await pressMeasuredPopover(screen.getByRole("button", { name: "Confirm event" }));
  expect(screen.getByText(/Table #1: Pending invitations still reserve places/)).toBeVisible();
  expect(
    screen.getByText(/Table #2: Seated players agree on date and location but not game/),
  ).toBeVisible();
  expect(screen.getByText(/Table: No compatible accepted players for this table/)).toBeVisible();
  expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  expect(writes).toEqual([]);
});

it("keeps a failed next tables page visible and retries once after a native paging gesture", async () => {
  tablesCursor = "event-next-table";
  nextTables = [{ ...tables[0], order: 1, id: "55555555-5555-4555-8555-555555555555" }];
  nextTablesCode = 503;
  await render(<Fixture />);
  await ready();
  const nextReads = () =>
    reads.filter(
      ({ pathname, searchParams }) =>
        pathname === `/api/events/${event.id}/tables` &&
        searchParams.get("cursor") === "event-next-table",
    );
  expect(nextReads()).toHaveLength(0);
  await select("Tables");
  const first = await screen.findByText("Table #1");
  let list: typeof first | null = first;
  while (list && typeof list.props.onScroll !== "function") list = list.parent;
  if (!list) throw new Error("Expected the actual tables list scroll owner");
  await scrollNativeListToEnd(list);
  expect(await screen.findByText("Could not load tables")).toBeVisible();
  expect(first).toBeVisible();
  expect(nextReads()).toHaveLength(1);
  await scrollNativeListToEnd(list, 1300);
  expect(nextReads()).toHaveLength(1);

  nextTablesCode = 200;
  await press("Load more");
  expect(await screen.findByText("Table #2")).toBeVisible();
  expect(first).toBeVisible();
  expect(nextReads()).toHaveLength(2);
});

it("removes a previously cached tables page when only that collection loses authorization", async () => {
  await render(<Fixture />);
  await ready();
  await select("Tables");
  expect(await screen.findByText("Table #1")).toBeVisible();
  tablesCode = 403;
  await act(() =>
    client.invalidateQueries({
      queryKey: recordTablesQuery(options(), event.id).queryKey,
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not load tables")).toBeVisible();
  expect(screen.queryByText("Table #1")).toBeNull();
  expect(screen.getByRole("header", { name: event.name })).toBeVisible();
});

it.each([
  { categories: "dates", voteLabel: "2030-06-03 20:00: Choose your vote", kind: "date" },
  { categories: "locations", voteLabel: "Club venue: Choose your vote", kind: "location" },
])(
  "lets a first $kind choice start from an older snapshot without saved votes",
  async ({ categories, voteLabel, kind }) => {
    const other = "77777777-7777-4777-8777-777777777777";
    event = {
      ...event,
      canVote: true,
      myRegistrations: [seat("owner")],
      myVotes: undefined,
      dates:
        categories === "dates" ? [...event.dates, { id: other, day: "2030-06-04" }] : event.dates,
      locations:
        categories === "locations"
          ? [...event.locations, { ...event.locations[0], id: other, name: "Other venue" }]
          : event.locations,
    };
    await render(<Fixture />);
    await ready();
    await press(voteLabel);
    await dialog("Yes");
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].input).toMatchObject({ kind, vote: "YES" });
  },
);
