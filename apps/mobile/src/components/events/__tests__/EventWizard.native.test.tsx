import type {
  GroupRecordResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  CommunityApiError,
  type CreateEventVariables,
  type EventRecordDraft,
  eventDraftInput,
  eventRecordKeys,
} from "@board-game-organizer/shared";
import type { AndroidNativeProps } from "@react-native-community/datetimepicker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { type ComponentProps, createContext, type ReactNode, useContext } from "react";
import { DeviceEventEmitter, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EventWizardScreen from "@/app/event/wizard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  NativeStackHeader,
  nativeStackOptionsSnapshot,
  resetNativeStackOptionsPort,
} from "@/test/nativeStackOptionsPort";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
} from "../../../../../web/src/test-fixtures/eventRecords";
import type { EventWizard } from "../EventWizard";
import { eventDraftFixture, tableDraftFixture } from "./eventWizardFixtures";

const headerPaths = () =>
  screen
    .getByTestId("native-stack-header")
    .queryAll((node) => node.type === "RNSVGPath")
    .map((node) => node.props.d);

const RouteParams = createContext<ComponentProps<typeof EventWizard>>({});

const API = "https://event-wizard-fixtures.test";
const boundary = vi.hoisted(() => ({
  back: vi.fn(),
  pickerRemoval: undefined as (() => void) | undefined,
  dismissTo: vi.fn(),
  feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn(), onSuccess: vi.fn() },
  picker: { open: vi.fn(), dismiss: vi.fn() },
}));
const options = {
  apiUrl: API,
  userId: "owner",
  enabled: true,
  getToken: async () => "fixture-owner-token",
  feedback: boundary.feedback,
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: options.getToken,
  }),
}));
vi.mock("expo-router", async () => ({
  useRouter: () => ({ back: boundary.back, dismissTo: boundary.dismissTo }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => useContext(RouteParams),
  Stack: { Screen: (await import("@/test/nativeStackOptionsPort")).NativeStackScreen },
}));
vi.mock("expo-router/react-navigation", async (original) => ({
  ...(await original<typeof import("expo-router/react-navigation")>()),
  usePreventRemove: (enabled: boolean, callback: () => void) => {
    boundary.pickerRemoval = enabled ? callback : undefined;
  },
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { apiUrl: "https://event-wizard-fixtures.test", maptilerApiKey: "wizard-fixture-map" },
    },
  },
}));
vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
}));
// MapLibre is the device boundary. The actual location form and Query hooks render normally.
vi.mock("@maplibre/maplibre-react-native", () => ({
  Map: ({ children }: { children: ReactNode }) => (
    <View testID="wizard-native-map">{children}</View>
  ),
  Camera: () => <View />,
  GeoJSONSource: View,
  Layer: View,
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: boundary.picker,
}));

let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let group: GroupRecordResponse;
let eventStatus: number;
let groupStatus: number;
let tablesStatus: number;
let writeStatus: number;
let pendingEvent: Promise<Response> | undefined;
let nextTablePage: Promise<Response> | undefined;
let nextTableCursor: string | null;
let favoriteStatus: number;
const reads: URL[] = [];
const additionalGame = {
  id: 7,
  name: "Additional strategy game",
  year: 2024,
  imageUrl: null,
  minPlayers: 2,
  maxPlayers: 4,
  maxPlayMinutes: 60,
  source: "search",
};
const anotherLocation = {
  ...plannedEvent.locations[0],
  id: "55555555-5555-4555-8555-555555555555",
  address: "Via Torino 14, Rome, Italy",
  latitude: 42.01,
  longitude: 12.89,
};
const demoCandidate = {
  userId: "demo-player",
  name: "Demo Player",
  username: "demo-player",
  avatarUrl: null,
  isAdmin: true,
  membership: null,
  ban: null,
};
const writes: { method: string; path: string; input: Record<string, unknown> }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks();
  resetNativeStackOptionsPort();
  boundary.pickerRemoval = undefined;
  event = { ...plannedEvent };
  table = { ...plannedTable };
  group = { ...groupRecord };
  eventStatus = groupStatus = tablesStatus = writeStatus = favoriteStatus = 200;
  pendingEvent = nextTablePage = undefined;
  nextTableCursor = null;
  reads.length = writes.length = 0;
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
        const body = JSON.parse(String(init?.body));
        writes.push({ method, path: url.pathname, input: body });
        return json(
          writeStatus === 200
            ? {
                ...event,
                name: body.name ?? event.name,
                version: method === "PATCH" ? event.version + 1 : 1,
              }
            : { error: "Fixture event rejected" },
          writeStatus,
        );
      }
      reads.push(url);
      if (url.pathname === `/api/events/${event.id}`)
        return (
          pendingEvent ??
          json(eventStatus === 200 ? event : { error: "Fixture event unavailable" }, eventStatus)
        );
      if (url.pathname === `/api/events/${event.id}/tables`)
        return (
          (url.searchParams.has("cursor") && nextTablePage) ||
          json(
            tablesStatus === 200
              ? { items: [table], nextCursor: nextTableCursor }
              : { error: "Fixture tables unavailable" },
            tablesStatus,
          )
        );
      if (url.pathname === `/api/groups/${group.id}`)
        return json(
          groupStatus === 200 ? group : { error: "Fixture group unavailable" },
          groupStatus,
        );
      if (url.pathname === `/api/groups/${group.id}/members`)
        return json({ items: [demoCandidate], nextCursor: null });
      if (url.pathname === "/api/bgg/picker")
        return json({
          items: url.searchParams.get("query") ? [additionalGame] : [],
          sourceEpoch: "participant-source",
          nextCursor: null,
        });
      if (url.pathname === "/api/groups") return json({ items: [group], nextCursor: null });
      if (url.pathname === "/api/events") return json({ items: [], nextCursor: null });
      if (url.pathname === "/api/bgg/account") return json({ active: null, pending: null });
      if (url.pathname === "/api/locations/search") return json({ items: [anotherLocation] });
      if (url.pathname === "/api/locations/favorites") {
        if (url.searchParams.has("keys"))
          return json(
            favoriteStatus === 200 ? { keys: [] } : { error: "Unavailable" },
            favoriteStatus,
          );
        return json({ items: [], nextCursor: null });
      }
      throw new Error(`Unexpected fixture path: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  showHeader,
  ...props
}: ComponentProps<typeof EventWizard> & { showHeader?: boolean } = {}) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <RouteParams value={props}>
          <EventWizardScreen />
        </RouteParams>
        {showHeader ? <NativeStackHeader /> : null}
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(screen.getByRole("button", { name }));
}
function validDraft(change: Partial<EventRecordDraft> = {}) {
  return eventDraftFixture({ groupId: null, dates: event.dates, ...change });
}
function recovery(
  draft = validDraft(),
  status: "pending" | "error" = "error",
  includeDraft = true,
) {
  const parsed = eventDraftInput(validDraft({ groupId: draft.groupId }), false);
  if (!parsed.success || "version" in parsed.data)
    throw new Error("Expected valid authored creation fixture");
  const variables: CreateEventVariables = {
    ...parsed.data,
    clientRequestId: "88888888-8888-4888-8888-888888888888",
    ...(includeDraft ? { clientDraft: draft } : {}),
    ...(draft.groupId ? { clientInitialGroupId: draft.groupId } : {}),
  };
  const error = new CommunityApiError(400, "Fixture event rejected");
  return client.getMutationCache().build(
    client,
    { mutationKey: eventRecordKeys.mutation(options, "", "create") },
    {
      context: undefined,
      data: undefined,
      error: status === "error" ? error : null,
      failureCount: status === "error" ? 1 : 0,
      failureReason: status === "error" ? error : null,
      isPaused: false,
      status,
      variables,
      submittedAt: Date.now(),
    },
  );
}
async function recovered(draft = validDraft()) {
  const mutation = recovery(draft);
  return render(<Fixture draftId={String(mutation.mutationId)} />);
}
async function tablesStep() {
  await press("Next");
  await press("Next");
}
async function reviewStep() {
  await tablesStep();
  await press("Next");
}

it("starts a real standalone draft, blocks forward skipping and reports required information before schedule entry", async () => {
  await render(<Fixture />);
  expect(screen.getByRole("button", { name: "1. Event" })).toBeSelected();
  for (const name of ["2. Dates / Locations", "3. Tables", "4. Review"])
    expect(screen.getByRole("button", { name })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Public" })).toBeDisabled();
  await press("Next");
  expect(screen.getByText("Enter an event name between 5 and 30 characters.")).toBeVisible();
  expect(writes).toHaveLength(0);
  await fireEvent.changeText(screen.getByLabelText("Event name"), "Valid draft name");
  await press("Next");
  expect(screen.getByRole("button", { name: "2. Dates / Locations" })).toBeSelected();
  await press("Next");
  expect(screen.getByText("Choose at least one valid date and time.")).toBeVisible();
  expect(screen.getByText("Choose at least one verified location.")).toBeVisible();
  expect(boundary.dismissTo).not.toHaveBeenCalled();
});

it("retains recovered typed drafts across real steps and submits only after explicit review", async () => {
  await recovered();
  expect(screen.getByLabelText("Event name")).toHaveDisplayValue("Spring games evening");
  await press("Next");
  expect(screen.getByText("Games club")).toBeVisible();
  await userEvent.setup().press(screen.getByRole("switch", { name: "Allow date proposals" }));
  await press("Next");
  expect(screen.getByRole("button", { name: "3. Tables" })).toBeSelected();
  expect(screen.getByTestId("event-draft-table-local-table-key")).toBeOnTheScreen();
  await press("Next");
  expect(screen.getByRole("button", { name: "4. Review" })).toBeSelected();
  expect(screen.getByText("The organizer has no automatic playing seat.")).toBeVisible();
  expect(writes).toHaveLength(0);
  await press("Back");
  expect(screen.getByRole("button", { name: "3. Tables" })).toBeSelected();
  await press("Next");
  await press("Create event");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    method: "POST",
    path: "/api/events",
    input: {
      name: "Spring games evening",
      groupId: null,
      allowParticipantDates: true,
      clientRequestId: "88888888-8888-4888-8888-888888888888",
    },
  });
  expect(writes[0].input).not.toHaveProperty("clientDraft");
  expect((writes[0].input.tables as Record<string, unknown>[])[0]).not.toHaveProperty("name");
  expect(boundary.dismissTo).toHaveBeenCalledWith({
    pathname: "/(tabs)/events",
    params: { section: "mine" },
  });
  // A recovered creation is consumed when navigation is dispatched; this route
  // fixture deliberately remains mounted after the native navigation request.
  expect(screen.queryByRole("button", { name: "Create event" })).toBeNull();
});

it("routes a recovered grouped creation to that group's Events while reauthorizing its current manager", async () => {
  await recovered(validDraft({ groupId: group.id }));
  await waitFor(() => expect(screen.getByTestId("event-group-select")).toBeDisabled());
  await reviewStep();
  await press("Create event");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input.groupId).toBe(group.id);
  expect(boundary.dismissTo).toHaveBeenCalledWith({
    pathname: "/group/[groupId]",
    params: { groupId: group.id, tab: "events" },
  });
});

it("loads an existing event and real table page, preserves immutable visibility/group and saves its versioned edit", async () => {
  await render(<Fixture eventId={event.id} />);
  expect(await screen.findByLabelText("Event name")).toHaveDisplayValue(event.name);
  expect(screen.getByRole("radio", { name: "Private" })).toBeDisabled();
  expect(screen.getByText("Event visibility cannot be changed after creation.")).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText("Event name"), "Changed event name");
  await tablesStep();
  expect(await screen.findByTestId(`event-draft-table-${table.id}`)).toBeOnTheScreen();
  await press("Next");
  await press("Save event");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    method: "PATCH",
    path: `/api/events/${event.id}`,
    input: { version: 1, name: "Changed event name" },
  });
  expect(boundary.dismissTo).toHaveBeenCalledWith({
    pathname: "/event/[eventId]",
    params: { eventId: event.id },
  });
});

it("keeps the group return context only when it matches the event's actual group", async () => {
  event = { ...event, groupId: group.id, groupName: group.name, groupType: "PRIVATE" };
  await render(<Fixture eventId={event.id} fromGroup={group.id} />);
  await screen.findByLabelText("Event name");
  await reviewStep();
  await press("Save event");
  expect(boundary.dismissTo).toHaveBeenCalledWith({
    pathname: "/event/[eventId]",
    params: { eventId: event.id, fromGroup: group.id },
  });
});

it.each([403, 503])(
  "keeps an unavailable/denied edit explicit and enables the editor only after retry (%s)",
  async (status) => {
    eventStatus = status;
    await render(<Fixture eventId={event.id} />);
    expect(await screen.findByText("Could not edit event")).toBeVisible();
    expect(screen.queryByLabelText("Event name")).toBeNull();
    eventStatus = 200;
    await press("Try again");
    expect(await screen.findByLabelText("Event name")).toHaveDisplayValue(event.name);
  },
);

it("does not grant editor access from a successful detail read without current edit capability", async () => {
  event = { ...event, canEdit: false };
  await render(<Fixture eventId={event.id} />);
  expect(await screen.findByText("Could not edit event")).toBeVisible();
  expect(screen.queryByLabelText("Event name")).toBeNull();
});

it("keeps initial edit loading separate from an empty new event draft", async () => {
  let finish: (response: Response) => void = () => {};
  pendingEvent = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture eventId={event.id} />);
  expect(screen.queryByLabelText("Event name")).toBeNull();
  expect(screen.queryByText("Could not edit event")).toBeNull();
  await act(() => finish(json(event)));
  expect(await screen.findByLabelText("Event name")).toHaveDisplayValue(event.name);
});

it.each(["confirmed", "changed-version"] as const)(
  "blocks navigation/save after a canonical event becomes %s",
  async (reason) => {
    if (reason === "confirmed") event = { ...event, status: "CONFIRMED" };
    await render(<Fixture eventId={event.id} />);
    await screen.findByLabelText("Event name");
    if (reason === "changed-version")
      await act(() =>
        client.setQueryData(eventRecordKeys.detail(options, event.id), { ...event, version: 2 }),
      );
    expect(
      await screen.findByText(
        reason === "confirmed"
          ? "Bookings are closed"
          : "This event changed. Go back and reopen the editor before saving.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await press("Next");
    expect(writes).toHaveLength(0);
  },
);

it("requires an actual table, expands invalid table fields and accepts no fabricated draft game", async () => {
  await recovered(validDraft({ tables: [] }));
  await tablesStep();
  await press("Next");
  expect(screen.getByText("Add at least one table.")).toBeVisible();
  await press("Add table");
  expect(await screen.findByText("Table #1")).toBeVisible();
  expect(screen.queryByLabelText("Table name")).toBeNull();
  await press("Next");
  expect(screen.getByText("Choose at least one game.")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("keeps saved table numbers and uses the event's next number for new drafts", async () => {
  event = { ...event, nextTableOrder: 7 };
  table = { ...table, order: 3 };
  await render(<Fixture eventId={event.id} />);
  await screen.findByLabelText("Event name");
  await tablesStep();
  expect(await screen.findByText("Table #4")).toBeVisible();
  await press("Add table");
  expect(await screen.findByText("Table #8")).toBeVisible();
  expect(screen.getByText("Table #4")).toBeVisible();
  expect(screen.queryByLabelText("Table name")).toBeNull();
  expect(writes).toHaveLength(0);
});

it("requires explicit confirmation to remove an unsaved table and keeps cancellation reversible", async () => {
  await recovered();
  await tablesStep();
  await userEvent.setup().press(screen.getByTestId("event-draft-table-local-table-key"));
  await press("Remove table");
  expect(
    screen.getByText(
      "This table and its active registrations will be removed only when you save the event.",
    ),
  ).toBeVisible();
  await press("Cancel");
  expect(screen.getByTestId("event-draft-table-local-table-key")).toBeOnTheScreen();
  await press("Remove table");
  // Scope the decision to the actual dialog. Native modal accessibility
  // isolation is a device boundary; the background editor can remain in Node.
  await userEvent.setup().press(
    within(screen.getByTestId("confirmation-dialog")).getByRole("button", {
      name: "Remove table",
    }),
  );
  expect(screen.queryByTestId("event-draft-table-local-table-key")).toBeNull();
  expect(writes).toHaveLength(0);
});

it("opens the actual inline game picker and restores the table form on Android Back without losing edits", async () => {
  await recovered();
  await tablesStep();
  await userEvent.setup().press(screen.getByTestId("event-draft-table-local-table-key"));
  await press("Increase: Minimum players");
  expect(screen.getByLabelText("Minimum players: 3")).toBeVisible();
  await press("Choose a game");
  expect(screen.getByTestId("game-search-input")).toBeVisible();
  expect(screen.queryByText("Table #1")).toBeNull();
  await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
  expect(await screen.findByLabelText("Minimum players: 3")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("keeps an actual inline location picker reversible through native Back", async () => {
  await recovered();
  await press("Next");
  await press("Choose a location");
  expect(screen.getByLabelText("Location name")).toBeVisible();
  expect(screen.getByTestId("wizard-native-map")).toBeOnTheScreen();
  await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
  expect(screen.getByText("Games club")).toBeVisible();
  expect(screen.getByRole("button", { name: "2. Dates / Locations" })).toBeSelected();
});

it("keeps a failed table page observable and supports an explicit retry before review", async () => {
  tablesStatus = 503;
  await render(<Fixture eventId={event.id} />);
  await screen.findByLabelText("Event name");
  await tablesStep();
  expect(await screen.findByText("Could not load tables")).toBeVisible();
  tablesStatus = 200;
  await press("Try again");
  expect(await screen.findByTestId(`event-draft-table-${table.id}`)).toBeOnTheScreen();
  expect(screen.queryByText("Could not load tables")).toBeNull();
});

it("shows a selected group failure before granting its event management authority", async () => {
  groupStatus = 503;
  await render(<Fixture groupId={group.id} />);
  expect(await screen.findByText("Could not load group")).toBeVisible();
  await fireEvent.changeText(screen.getByLabelText("Event name"), "Valid grouped event");
  await press("Next");
  expect(screen.getByRole("button", { name: "1. Event" })).toBeSelected();
  groupStatus = 200;
  await press("Try again");
  await waitFor(() => expect(screen.queryByText("Could not load group")).toBeNull());
  await press("Next");
  expect(screen.getByRole("button", { name: "2. Dates / Locations" })).toBeSelected();
});

it.each(["missing", "pending", "missing-client-draft"] as const)(
  "does not manufacture recoverable event drafts from %s state",
  async (kind) => {
    const mutation =
      kind === "missing"
        ? undefined
        : recovery(
            validDraft(),
            kind === "pending" ? "pending" : "error",
            kind !== "missing-client-draft",
          );
    await render(<Fixture draftId={mutation ? String(mutation.mutationId) : "unknown-draft"} />);
    expect(screen.getByText("Could not recover draft")).toBeVisible();
    expect(screen.queryByLabelText("Event name")).toBeNull();
  },
);

it("preserves a rejected create as a real observable mutation failure rather than pretending it was saved", async () => {
  writeStatus = 400;
  await recovered();
  await reviewStep();
  await press("Create event");
  await waitFor(() => expect(boundary.feedback.onError).toHaveBeenCalled());
  expect(writes).toHaveLength(1);
  expect(boundary.dismissTo).toHaveBeenCalledOnce();
  expect(
    client
      .getMutationCache()
      .findAll({ mutationKey: eventRecordKeys.mutation(options, "", "create"), status: "error" })
      .length,
  ).toBeGreaterThan(0);
});

it("restores the real create/edit event header and native Back after merged inline location options", async () => {
  for (const edit of [false, true]) {
    resetNativeStackOptionsPort();
    const mutation = edit ? undefined : recovery();
    const view = await render(
      <Fixture
        showHeader
        eventId={edit ? event.id : undefined}
        draftId={mutation ? String(mutation.mutationId) : undefined}
      />,
    );
    await screen.findByLabelText("Event name");
    const title = edit ? "Edit event" : "Create event";
    expect(screen.getByRole("header", { name: title })).toBeVisible();
    expect(headerPaths()).toContain("M8 13h.01");
    await press("Next");
    await press("Choose a location");
    expect(screen.getByRole("header", { name: "Select location" })).toBeVisible();
    expect(headerPaths()).toContain(
      "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    );
    await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
    expect(screen.getByRole("header", { name: title })).toBeVisible();
    expect(headerPaths()).toContain("M8 13h.01");
    expect(nativeStackOptionsSnapshot()).toMatchObject({
      headerBackVisible: false,
      gestureEnabled: true,
    });
    expect(screen.getByRole("button", { name: "2. Dates / Locations" })).toBeSelected();
    await userEvent
      .setup()
      .press(
        within(screen.getByTestId("native-stack-header")).getByRole("button", { name: "Back" }),
      );
    expect(boundary.back).toHaveBeenCalledTimes(edit ? 2 : 1);
    expect(writes).toHaveLength(0);
    await view.unmount();
  }
});

it("appends another server table page without losing the first draft or sending edits", async () => {
  nextTableCursor = "later-event-tables";
  let resolve!: (response: Response) => void;
  nextTablePage = new Promise((respond) => {
    resolve = respond;
  });
  await render(<Fixture eventId={event.id} />);
  await screen.findByLabelText("Event name");
  await tablesStep();
  const first = await screen.findByTestId(`event-draft-table-${table.id}`);
  await press("Load more tables");
  const pageReads = () =>
    reads.filter(
      (url) => url.pathname === `/api/events/${event.id}/tables` && url.searchParams.has("cursor"),
    );
  await waitFor(() => expect(pageReads()).toHaveLength(1));
  expect(pageReads()[0].searchParams.get("cursor")).toBe(nextTableCursor);
  expect(screen.getByRole("button", { name: "Load more tables" })).toBeDisabled();
  await press("Load more tables");
  expect(pageReads()).toHaveLength(1);

  const added = { ...table, id: "44444444-4444-4444-8444-444444444444", order: 1 };
  await act(() => resolve(json({ items: [added], nextCursor: null })));
  expect(await screen.findByTestId(`event-draft-table-${added.id}`)).toBeOnTheScreen();
  expect(screen.getByTestId(`event-draft-table-${table.id}`)).toBe(first);
  expect(screen.queryByRole("button", { name: "Load more tables" })).toBeNull();
  expect(writes).toHaveLength(0);
});

it("scopes participants' game collections to the exact saved event and table", async () => {
  await render(<Fixture eventId={event.id} />);
  await screen.findByLabelText("Event name");
  await tablesStep();
  await userEvent.setup().press(await screen.findByTestId(`event-draft-table-${table.id}`));
  await press("Choose a game");
  await press("Participants' collections");
  await waitFor(() => {
    const request = reads.find((url) => url.pathname === "/api/bgg/picker");
    expect(request?.searchParams.get("participants")).toBe("1");
    expect(request?.searchParams.get("participantEventId")).toBe(event.id);
    expect(request?.searchParams.get("participantTableId")).toBe(table.id);
  });
  await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
  expect(await screen.findByText("Table #1")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("selects a member and then a guest demonstrator within an authorized public group draft", async () => {
  group = { ...groupRecord, type: "PUBLIC" };
  await recovered(
    validDraft({
      groupId: group.id,
      dates: [{ ...event.dates[0], startTime: "20:00" }],
      locations: [event.locations[0]],
      endsWall: "2030-06-03T23:00",
      cutoffWall: "2030-06-01T18:00",
      tables: [tableDraftFixture({ startsWall: "2030-06-03T20:00" })],
    }),
  );
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await tablesStep();
  await userEvent.setup().press(screen.getByTestId("event-draft-table-local-table-key"));
  await press("Choose demonstrator");
  await userEvent
    .setup()
    .press(await screen.findByRole("button", { name: "Select user: Demo Player" }));
  expect(await screen.findByText("Demo Player")).toBeVisible();
  expect(reads.some((url) => url.pathname === `/api/groups/${group.id}/members`)).toBe(true);

  const pick = screen.getByLabelText("Choose demonstrator");
  await userEvent.setup().press(pick);
  await fireEvent.changeText(await screen.findByLabelText("Guest name"), "  Guest Presenter  ");
  await press("Add a guest");
  expect(await screen.findByText("Guest Presenter")).toBeVisible();
  expect(screen.queryByText("Demo Player")).toBeNull();
  await press("Remove demonstrator");
  expect(screen.queryByText("Guest Presenter")).toBeNull();
  expect(screen.getByRole("button", { name: "Choose demonstrator" })).toBeEnabled();
  expect(writes).toHaveLength(0);
});

it("corrects a recovered public event's multi-date draft with the native calendar and preserves its start time", async () => {
  group = { ...groupRecord, type: "PUBLIC" };
  await recovered(
    validDraft({
      groupId: group.id,
      dates: [...event.dates, { id: "44444444-4444-4444-8444-444444444444", day: "2030-06-04" }],
      locations: [event.locations[0]],
      endsWall: "2030-06-03T23:00",
      cutoffWall: "2030-06-01T18:00",
      tables: [tableDraftFixture({ startsWall: "2030-06-03T20:00" })],
    }),
  );
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await press("Next");
  await press("Next");
  expect(screen.getByText("Choose exactly one valid date and time.")).toBeVisible();
  expect(screen.getByRole("button", { name: "2. Dates / Locations" })).toBeSelected();
  await press("Event date");
  const args = boundary.picker.open.mock.lastCall?.[0] as AndroidNativeProps | undefined;
  expect(args?.mode).toBe("date");
  const next = new Date("2030-06-04T00:00:00Z");
  await act(() =>
    args?.onChange?.(
      { type: "set", nativeEvent: { timestamp: next.getTime(), utcOffset: 0 } },
      next,
    ),
  );
  expect(screen.getByRole("button", { name: "Start time" })).toHaveTextContent("8:00 PM");
  expect(screen.queryByText("Choose exactly one valid date and time.")).toBeNull();
  await press("Next");
  expect(screen.getByRole("button", { name: "3. Tables" })).toBeSelected();
  expect(writes).toHaveLength(0);
});

it("keeps scheduling editable after favorite-location status fails without treating it as location denial", async () => {
  favoriteStatus = 503;
  await recovered();
  await press("Next");
  expect(await screen.findByText("Could not load favorite locations")).toBeVisible();
  expect(screen.getByText("Games club")).toBeVisible();
  expect(screen.getByRole("button", { name: "Choose a location" })).toBeEnabled();
  await press("Next");
  expect(screen.getByRole("button", { name: "3. Tables" })).toBeSelected();
  expect(writes).toHaveLength(0);
});

it("returns verified location and selected catalog game to their actual event draft and supports completed step navigation", async () => {
  const mutation = recovery();
  await render(<Fixture draftId={String(mutation.mutationId)} showHeader />);
  await press("Next");
  await press("Choose a location");
  await fireEvent.changeText(screen.getByLabelText("Location name"), "Additional verified venue");
  await fireEvent.changeText(screen.getByTestId("location-address-input"), "Via Torino");
  await userEvent.setup().press(await screen.findByTestId("address-result-0"));
  await press("Confirm Location");
  expect(await screen.findByText("Additional verified venue")).toBeVisible();
  expect(screen.getByText("Games club")).toBeVisible();

  await press("Next");
  await userEvent.setup().press(screen.getByTestId("event-draft-table-local-table-key"));
  await press("Choose a game");
  await fireEvent.changeText(screen.getByTestId("game-search-input"), "Additional");
  await userEvent.setup().press(
    await screen.findByRole("button", {
      name: "Select: Additional strategy game",
    }),
  );
  expect(await screen.findByText("Additional strategy game")).toBeVisible();
  expect(screen.getByText("First strategy game")).toBeVisible();
  await press("2. Dates / Locations");
  expect(screen.getByText("Additional verified venue")).toBeVisible();
  expect(screen.queryByTestId("game-search-input")).toBeNull();
  expect(writes).toHaveLength(0);
});

it("dismisses either inline picker through its normal native navigation control and preserves reviewable draft data", async () => {
  const mutation = recovery();
  await render(<Fixture showHeader draftId={String(mutation.mutationId)} />);
  await press("Next");
  await press("Choose a location");
  expect(screen.getByLabelText("Location name")).toBeVisible();
  if (!boundary.pickerRemoval) throw new Error("Expected the inline location route-removal guard");
  await act(boundary.pickerRemoval);
  expect(screen.queryByLabelText("Location name")).toBeNull();
  expect(screen.getByText("Games club")).toBeVisible();

  await press("Next");
  await userEvent.setup().press(screen.getByTestId("event-draft-table-local-table-key"));
  await press("Choose a game");
  expect(screen.getByTestId("game-search-input")).toBeVisible();
  await userEvent
    .setup()
    .press(within(screen.getByTestId("native-stack-header")).getByRole("button", { name: "Back" }));
  expect(screen.queryByTestId("game-search-input")).toBeNull();
  expect(screen.getByText("First strategy game")).toBeVisible();
  expect(screen.getByRole("button", { name: "3. Tables" })).toBeSelected();
  expect(boundary.back).not.toHaveBeenCalled();
  expect(writes).toEqual([]);
});

it("keeps an already expanded invalid table open on repeated review attempts without submitting", async () => {
  await recovered(validDraft({ tables: [tableDraftFixture({ games: [] })] }));
  await tablesStep();
  for (const _ of [1, 2]) {
    await press("Next");
    expect(screen.getByText("Choose at least one game.")).toBeVisible();
    expect(screen.getByRole("button", { name: "3. Tables" })).toBeSelected();
    expect(screen.queryByRole("button", { name: "Create event" })).toBeNull();
    expect(writes).toEqual([]);
  }
});
