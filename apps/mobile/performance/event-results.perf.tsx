import type {
  PlannedEventResponse,
  PlannedTableResponse,
  SaveTableResultInput,
} from "@board-game-organizer/schemas";
import { eventRecordKeys } from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type ReactNode, useEffect } from "react";
import { View } from "react-native";
import { expect, it, vi } from "vitest";
import EventResultsScreen from "@/app/event/results";
import { EventTableResults } from "@/components/events/EventTableResults";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent, plannedTable, seat } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://native-results-perf.test",
  getToken: async () => "results-fixture-token",
  back: vi.fn(),
  dismissTo: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "results-fixture-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: boundary.apiUrl } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: boundary.back, dismissTo: boundary.dismissTo }),
  useLocalSearchParams: () => ({ eventId: event.id, tableId: table.id }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useFocusEffect: (effect: () => undefined | (() => void)) => useEffect(effect, [effect]),
  Stack: {
    Screen: ({ options }: { options: { headerLeft?: () => ReactNode } }) => (
      <View>{options.headerLeft?.()}</View>
    ),
  },
}));

const event: PlannedEventResponse = {
  ...plannedEvent,
  status: "CONFIRMED",
  canManage: true,
  managementRole: "admin",
  canFinalize: true,
  confirmed: {
    dateId: plannedEvent.dates[0].id,
    locationId: plannedEvent.locations[0].id,
    at: "2030-06-03T18:00:00Z",
  },
};
const table: PlannedTableResponse = {
  ...plannedTable,
  eventStatus: "CONFIRMED",
  eventVersion: event.version,
  confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  resultDraft: {
    lowerWins: false,
    entries: [
      { userId: "owner", score: "20" },
      { userId: "guest", score: "10" },
    ],
    tieBreaks: [],
  },
};
const roster = {
  items: [
    { ...seat("owner"), name: "Owner Player" },
    { ...seat("guest"), id: "55555555-5555-4555-8555-555555555555", name: "Guest Player" },
    {
      ...seat("waiting"),
      id: "66666666-6666-4666-8666-666666666666",
      name: "Waiting Player",
      position: "WAITING" as const,
    },
  ],
  nextCursor: null,
};
const options = {
  apiUrl: boundary.apiUrl,
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
const eventPath = `/api/events/${event.id}`;
const tablePath = `${eventPath}/tables/${table.id}`;
const eventKey = eventRecordKeys.detail(options, event.id);
const tableKey = eventRecordKeys.table(options, event.id, table.id);
const seatsKey = [...eventRecordKeys.root(options), "seats", event.id, table.id, false, ""];

it("EventResults: edit a frozen score and reconcile the authoritative save", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const save = vi.fn<(input: SaveTableResultInput) => void>();
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    expect(url.origin).toBe(boundary.apiUrl);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer results-fixture-token");
    if (method === "GET") {
      if (url.pathname === eventPath) return Response.json(event);
      if (url.pathname === tablePath) return Response.json(table);
      if (url.pathname === `${tablePath}/seats`) return Response.json(roster);
    }
    if (method === "PUT" && url.pathname === `${tablePath}/results`) {
      const { version, ...resultDraft } = JSON.parse(String(init?.body)) as SaveTableResultInput;
      save({ version, ...resultDraft });
      return Response.json({
        event: { ...event, version: event.version + 1, resultsReady: true },
        table: { ...table, eventVersion: event.version + 1, resultDraft },
      });
    }
    throw new Error(`Unexpected native results request: ${method} ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetch);
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  }
  try {
    const measured = await measureRenders(<EventResultsScreen />, {
      wrapper: Providers,
      beforeEach: () => {
        client.clear();
        client.setQueryData(eventKey, event);
        client.setQueryData(tableKey, table);
        client.setQueryData(seatsKey, { pages: [roster], pageParams: [""] });
        save.mockClear();
        boundary.dismissTo.mockClear();
      },
      scenario: async () => {
        const player = await screen.findByRole("button", { name: "Score: Guest Player" });
        const heading = screen.getByText("Chess");
        expect(heading).toBeVisible();
        expect(heading).toHaveProp("accessibilityRole", "header");
        expect(screen.queryByRole("button", { name: "Score: Waiting Player" })).toBeNull();
        expect(save).not.toHaveBeenCalled();
        const user = userEvent.setup();
        await user.press(player);
        const input = await screen.findByTestId("table-score-input-guest");
        expect(input).toHaveDisplayValue("10");
        await fireEvent.changeText(input, "30");
        await user.press(screen.getByRole("button", { name: "Done" }));
        expect(screen.getByText("30")).toBeVisible();
        expect(screen.getAllByRole("button", { name: /^Score: / })[0]).toHaveAccessibleName(
          "Score: Guest Player",
        );
        await user.press(screen.getByRole("button", { name: "Save result" }));
        await waitFor(() =>
          expect(boundary.dismissTo).toHaveBeenCalledExactlyOnceWith({
            pathname: "/event/table",
            params: { eventId: event.id, tableId: table.id },
          }),
        );
        expect(save).toHaveBeenCalledExactlyOnceWith({
          version: event.version,
          lowerWins: false,
          entries: [
            { userId: "owner", score: "20" },
            { userId: "guest", score: "30" },
          ],
          tieBreaks: [],
        });
        expect(client.getQueryData(eventKey)).toMatchObject({ resultsReady: true });
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
    vi.unstubAllGlobals();
  }
});

it("EventTableResults: expand immutable group and global ratings for a finished table", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const finished: PlannedTableResponse = {
    ...table,
    groupId: "33333333-3333-4333-8333-333333333333",
    eventStatus: "TERMINATED",
    results: {
      lowerWins: false,
      entries: [
        { userId: "owner", score: "20", rank: 1 },
        { userId: "guest", score: "10", rank: 2 },
      ],
      tieBreaks: [],
      finalizedAt: "2030-06-04T12:00:00Z",
    },
    resultProfiles: [
      { userId: "owner", name: "Owner Player", username: "owner", email: null, avatarUrl: null },
      { userId: "guest", name: "Guest Player", username: "guest", email: null, avatarUrl: null },
    ],
    ratingChanges: [{ userId: "owner", score: 1225, delta: 25, provisional: true }],
    groupRatingChanges: [{ userId: "owner", score: 790, delta: -10, provisional: false }],
  };
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  }
  try {
    const measured = await measureRenders(<EventTableResults table={finished} />, {
      wrapper: Providers,
      beforeEach: () => {
        client.clear();
        fetch.mockClear();
      },
      scenario: async () => {
        expect(screen.getByText("Chess")).toBeVisible();
        expect(screen.getByText("Winner")).toBeVisible();
        const trigger = screen.getByRole("button", { name: /@owner, Position/, expanded: false });
        expect(screen.queryByText("Group")).toBeNull();
        expect(screen.queryByText("Global")).toBeNull();
        const user = userEvent.setup();
        await user.press(trigger);
        expect(trigger).toBeExpanded();
        expect(screen.getByLabelText("Rating before: 800")).toBeVisible();
        expect(screen.getByLabelText("Rating after: 790")).toBeVisible();
        expect(screen.getByLabelText("Rating change: -10")).toBeVisible();
        expect(screen.getByLabelText("Rating before: 1,200")).toBeVisible();
        expect(screen.getByLabelText("Rating after: 1,225")).toBeVisible();
        expect(screen.getByLabelText("Rating change: +25")).toBeVisible();
        expect(screen.getByLabelText("Provisional rating")).toBeVisible();
        await user.press(trigger);
        expect(trigger).not.toBeExpanded();
        expect(screen.queryByText("Global")).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    client.clear();
    vi.unstubAllGlobals();
  }
});
