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
import type { ComponentProps } from "react";
import { DeviceEventEmitter, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
import { EventWizard } from "../EventWizard";
import { eventDraftFixture } from "./eventWizardFixtures";

const headerPaths = () =>
  screen
    .getByTestId("native-stack-header")
    .queryAll((node) => node.type === "RNSVGPath")
    .map((node) => node.props.d);

const API = "https://event-wizard-fixtures.test";
const boundary = vi.hoisted(() => ({
  back: vi.fn(),
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
  useLocalSearchParams: () => ({}),
  Stack: { Screen: (await import("@/test/nativeStackOptionsPort")).NativeStackScreen },
}));
vi.mock("expo-router/react-navigation", async (original) => ({
  ...(await original<typeof import("expo-router/react-navigation")>()),
  usePreventRemove: () => {},
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://event-wizard-fixtures.test" } } },
}));
vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
}));
// These external native SDK views are never mounted by the unconfigured-map
// fixture; the application's inline LocationPicker still renders unchanged.
vi.mock("@maplibre/maplibre-react-native", () => ({
  Map: View,
  Camera: View,
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
const writes: { method: string; path: string; input: Record<string, unknown> }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks();
  resetNativeStackOptionsPort();
  event = { ...plannedEvent };
  table = { ...plannedTable };
  group = { ...groupRecord };
  eventStatus = groupStatus = tablesStatus = writeStatus = 200;
  pendingEvent = undefined;
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
      if (url.pathname === `/api/events/${event.id}`)
        return (
          pendingEvent ??
          json(eventStatus === 200 ? event : { error: "Fixture event unavailable" }, eventStatus)
        );
      if (url.pathname === `/api/events/${event.id}/tables`)
        return json(
          tablesStatus === 200
            ? { items: [table], nextCursor: null }
            : { error: "Fixture tables unavailable" },
          tablesStatus,
        );
      if (url.pathname === `/api/groups/${group.id}`)
        return json(
          groupStatus === 200 ? group : { error: "Fixture group unavailable" },
          groupStatus,
        );
      if (url.pathname === "/api/groups") return json({ items: [group], nextCursor: null });
      if (url.pathname === "/api/events") return json({ items: [], nextCursor: null });
      if (url.pathname === "/api/bgg/account") return json({ active: null, pending: null });
      if (url.pathname === "/api/locations/favorites")
        return json(url.searchParams.has("keys") ? { keys: [] } : { items: [], nextCursor: null });
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
        <EventWizard {...props} />
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
  expect(screen.getByText("Map unavailable")).toBeVisible();
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
