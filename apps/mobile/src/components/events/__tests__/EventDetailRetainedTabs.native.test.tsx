import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import {
  groupRecord,
  plannedEvent,
  plannedTable,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventDetail } from "../EventDetail";

const boundary = vi.hoisted(() => ({
  event: undefined as typeof plannedEvent | undefined,
  tables: [undefined] as unknown as (typeof plannedTable)[],
  fetchNextPage: vi.fn(),
  resetPresentation: vi.fn(),
  refetch: vi.fn(),
  getToken: vi.fn(async () => "fixture-token"),
  push: vi.fn(),
}));

// Remote models/actions and session/router boundaries are controlled. Native lists, retained
// panels, their headers, HeroUI tabs, cards and popovers remain the real code.
const navigation = { getState: () => ({ type: "stack" }), setOptions: vi.fn() };
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  useNavigation: () => navigation,
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://retained-fixtures.test",
    userId: "owner",
    enabled: false,
    getToken: boundary.getToken,
  }),
}));
vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  useEventRecord: () => ({ data: boundary.event, refetch: boundary.refetch }),
  useRecordTables: () => ({
    items: boundary.tables,
    hasNextPage: true,
    fetchNextPage: boundary.fetchNextPage,
    resetPresentation: boundary.resetPresentation,
    isFetching: false,
    isFetchNextPageError: false,
    isPending: false,
    isError: false,
    isFetchingNextPage: false,
    refetch: boundary.refetch,
  }),
  useEventRecordActions: () => ({ busy: false, blocking: false }),
  useEventProposalSection: () => ({ visible: false }),
  useNotificationChanges: () => ({
    changes: [],
    tabCounts: { details: 0, participants: 0, tables: 0 },
    hasNextPage: false,
    isPending: false,
    isError: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isReading: false,
    fetchNextPage: boundary.fetchNextPage,
    refetch: boundary.refetch,
    markAllAsRead: vi.fn(),
    resetWindow: vi.fn(),
  }),
}));

let client: QueryClient;
let scrollCommands: {
  scrollTo: (target: unknown, x: number, y: number, animated: boolean) => void;
};
beforeEach(() => {
  vi.clearAllMocks();
  boundary.event = plannedEvent;
  boundary.tables = [plannedTable];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  // Match the native-owned module used by the real ScrollView implementation.
  scrollCommands = createRequire(import.meta.url)(
    "react-native/Libraries/Components/ScrollView/ScrollViewCommands",
  ).default;
  vi.spyOn(scrollCommands, "scrollTo");
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
});

function Fixture() {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventDetail eventId={plannedEvent.id} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}

function nativeScrollHost(node: ReturnType<typeof screen.getByText>) {
  let current: typeof node | null = node;
  while (current && typeof current.props.onScroll !== "function") current = current.parent;
  if (!current) throw new Error("Expected the actual native scroll host");
  return current;
}
const bottomScroll = {
  timeStamp: 1000,
  nativeEvent: {
    contentSize: { width: 390, height: 10000 },
    layoutMeasurement: { width: 390, height: 500 },
    contentOffset: { x: 0, y: 9500 },
    zoomScale: 1,
  },
};

async function changeTab(name: string, activeScroll: ReturnType<typeof nativeScrollHost>) {
  const before = vi.mocked(scrollCommands.scrollTo).mock.calls.length;
  await fireEvent.press(screen.getByRole("tab", { name }));
  const calls = vi.mocked(scrollCommands.scrollTo).mock.calls.slice(before);
  expect(calls).toHaveLength(1);
  const [target, x, y, animated] = calls[0];
  expect(target).toEqual(
    expect.objectContaining({
      props: expect.objectContaining({ onScroll: activeScroll.props.onScroll }),
    }),
  );
  expect({ x, y, animated }).toEqual({ x: 0, y: 0, animated: false });
}

// This proves retained content and real ScrollView command intent; the native
// renderer boundary does not execute physical scrolling or measure frame timing.
it("retains actual Event content and headers across tab switches while rejecting hidden paging", async () => {
  const view = await render(<Fixture />);
  expect(screen.getByRole("heading", { name: "Details" })).toBeVisible();
  const detailsName = screen.getByText("Dates and times");
  const detailHeader = screen.getByRole("header", { name: plannedEvent.name });
  const detailsScroll = nativeScrollHost(detailsName);
  expect(detailsName).toBeVisible();
  expect(screen.queryByText("Table #1")).toBeNull();
  await changeTab("Tables", detailsScroll);
  expect(screen.getByRole("heading", { name: "Tables" })).toBeVisible();
  const tableName = screen.getByText("Table #1");
  const tablesScroll = nativeScrollHost(tableName);
  const tableHeader = screen.getByRole("header", { name: plannedEvent.name });
  expect(tableHeader).not.toBe(detailHeader);
  const previousScroll = tablesScroll.props.onScroll;
  await fireEvent(tablesScroll, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } },
  });
  const content = tablesScroll.queryAll((node) => typeof node.props.onLayout === "function")[0];
  if (!content) throw new Error("Expected the actual native table scroll content host");
  await fireEvent(content, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 10000 } },
  });
  expect(screen.queryByText("Dates and times")).toBeNull();
  for (const tab of ["Details", "Tables", "Details"]) {
    await changeTab(tab, tab === "Details" ? tablesScroll : detailsScroll);
    expect(screen.getByRole("tab", { name: tab })).toBeSelected();
    if (tab === "Details") {
      expect(screen.getByText("Dates and times")).toBe(detailsName);
      expect(nativeScrollHost(screen.getByText("Dates and times"))).toBe(detailsScroll);
      expect(screen.getByRole("header", { name: plannedEvent.name })).toBe(detailHeader);
      expect(screen.queryByText("Table #1")).toBeNull();
      await act(() => previousScroll(bottomScroll));
    } else {
      expect(screen.getByText("Table #1")).toBe(tableName);
      expect(nativeScrollHost(screen.getByText("Table #1"))).toBe(tablesScroll);
      expect(screen.getByRole("header", { name: plannedEvent.name })).toBe(tableHeader);
    }
  }
  expect(boundary.fetchNextPage).not.toHaveBeenCalled();
  expect(boundary.resetPresentation).toHaveBeenCalledTimes(2);
  await changeTab("Tables", detailsScroll);
  await fireEvent.press(screen.getByRole("button", { name: "Load more" }));
  expect(boundary.fetchNextPage).toHaveBeenCalledOnce();
  expect(boundary.getToken).not.toHaveBeenCalled();
  await view.unmount();
  expect(() => view.container).toThrow("unmounted test renderer");
});

it("updates a retained native table viewport when the authoritative record changes", async () => {
  await render(<Fixture />);
  await fireEvent.press(screen.getByRole("tab", { name: "Tables" }));
  const tableName = screen.getByText("Table #1");
  const tablesScroll = nativeScrollHost(tableName);
  await fireEvent.press(screen.getByRole("tab", { name: "Details" }));
  boundary.tables = [
    { ...plannedTable, eventStatus: "CONFIRMED", confirmedGameName: "Updated authoritative game" },
  ];
  await screen.rerender(<Fixture />);
  await fireEvent.press(screen.getByRole("tab", { name: "Tables" }));
  expect(screen.getByText("Updated authoritative game")).toBe(tableName);
  expect(nativeScrollHost(screen.getByText("Updated authoritative game"))).toBe(tablesScroll);
  expect(screen.queryByText("Table #1")).toBeNull();
  expect(boundary.getToken).not.toHaveBeenCalled();
});

import { createRequire } from "node:module";

it("moves the table filter to the header while keeping the same ordering controls", async () => {
  boundary.tables = [
    { ...plannedTable, id: "first", order: 0, seatedCount: 2 },
    { ...plannedTable, id: "second", order: 1, seatedCount: 1 },
  ];
  await render(<Fixture />);
  await fireEvent.press(screen.getByRole("tab", { name: "Tables" }));
  const filter = screen.getByTestId("list-search-input");
  expect(screen.getByTestId("list-sort-field")).toBeVisible();
  await fireEvent(filter, "focus");
  expect(navigation.setOptions).toHaveBeenCalledWith({ headerShown: false });
  expect(screen.queryByRole("button", { name: "Event tables help" })).toBeNull();
  expect(screen.getByTestId("list-sort-field")).toBeVisible();
  await fireEvent.changeText(filter, "2");
  await waitFor(() => expect(screen.queryByText("Table #1")).toBeNull());
  expect(screen.getByText("Table #2")).toBeVisible();
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(navigation.setOptions).toHaveBeenLastCalledWith({ headerShown: true });
  expect(screen.getByTestId("list-sort-field")).toBeVisible();
  expect(screen.getByText("Table #1")).toBeVisible();
});

it("introduces event details with the active settings and Group below Locations", async () => {
  boundary.event = {
    ...plannedEvent,
    groupId: groupRecord.id,
    groupName: groupRecord.name,
    planningMode: "ASSISTED",
    playerPreference: "BEST",
    allowBestReduction: true,
  };
  await installNativePopoverMeasurements();
  await render(<Fixture />);
  const sectionLabels = screen
    .getAllByText(/^(Dates and times|Locations|Group)$/)
    .map((node) => node.props.children);
  expect(sectionLabels).toEqual(["Dates and times", "Locations", "Group"]);
  await pressMeasuredPopover(screen.getByRole("button", { name: "Event details help" }));
  expect(
    screen.getByText("To join the event, open Tables, choose a table and sign up."),
  ).toBeVisible();
  expect(screen.getByText(/Assisted: The app seeks compatible players/)).toBeVisible();
  expect(screen.getByText(/BGG Best: Prefers the player count marked Best on BGG/)).toBeVisible();
  expect(
    screen.getByText("Assisted planning may seat fewer players to improve the BGG recommendation."),
  ).toBeVisible();
});

it("replaces the registration explanation when the event has been confirmed", async () => {
  boundary.event = { ...plannedEvent, status: "CONFIRMED" };
  await installNativePopoverMeasurements();
  await render(<Fixture />);
  await fireEvent.press(screen.getByRole("tab", { name: "Tables" }));
  await pressMeasuredPopover(screen.getByRole("button", { name: "Event tables help" }));
  expect(
    screen.getByText(
      "Only players with confirmed seats at tables that reached the minimum player count and met the event requirements take part.",
    ),
  ).toBeVisible();
  expect(
    screen.queryByText("To take part in the event, register for at least one table."),
  ).toBeNull();
});

it.each([
  [
    "Participants",
    "Event participants help",
    "Players with a seat or a waiting-list place at one or more event tables appear here.",
  ],
  ["Tables", "Event tables help", "To take part in the event, register for at least one table."],
])("explains the planning roster from the %s tab", async (tab, label, explanation) => {
  await installNativePopoverMeasurements();
  await render(<Fixture />);
  await fireEvent.press(screen.getByRole("tab", { name: tab }));
  expect(screen.getByRole("heading", { name: tab })).toBeVisible();
  await pressMeasuredPopover(screen.getByRole("button", { name: label }));
  expect(screen.getByText(explanation)).toBeVisible();
  expect(screen.queryByText("Settings")).toBeNull();
});

it("explains date and location voting together and only offers explanation for enabled proposals", async () => {
  const option = "99999999-9999-4999-8999-999999999999";
  boundary.event = {
    ...plannedEvent,
    dates: [...plannedEvent.dates, { ...plannedEvent.dates[0], id: option, day: "2030-06-08" }],
    locations: [
      ...plannedEvent.locations,
      { ...plannedEvent.locations[0], id: option, name: "Alternative venue" },
    ],
    allowParticipantDates: true,
    allowParticipantLocations: false,
  };
  await installNativePopoverMeasurements();
  await render(<Fixture />);
  await pressMeasuredPopover(screen.getByRole("button", { name: "Event details help" }));
  expect(screen.getByText("Dates, times and locations")).toBeVisible();
  expect(screen.getByText(/accepted participant in at least one table/)).toBeVisible();
  expect(screen.getByText(/can propose other dates and times/)).toBeVisible();
  expect(screen.queryByText(/can propose other locations/)).toBeNull();
});
