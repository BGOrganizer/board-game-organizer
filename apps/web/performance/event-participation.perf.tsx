import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventRecordKeys } from "@board-game-organizer/shared";
import { configure, measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { EventJoinSheet } from "@/components/events/EventJoinSheet";
import { EventProposalEditor } from "@/components/events/EventProposalEditor";
import { optionId, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => {
  const previousApi = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://event-participation-render.test";
  return {
    previousApi,
    getToken: vi.fn(async () => "unused-cached-participation-token"),
    back: vi.fn(),
    close: vi.fn(),
  };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: boundary.back }) }));
// Only the external WebGL SDK is replaced; the date editor and its app hooks stay real.
vi.mock("@maptiler/sdk", () => ({
  config: { apiKey: "" },
  MapStyle: { STREETS: { DARK: "dark" } },
  Map: class {
    remove() {}
    setStyle() {}
    flyTo() {}
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));
const options = {
  apiUrl: "https://event-participation-render.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
const foreignOptions = { ...options, userId: "other-owner" };
const alternativeId = "55555555-5555-4555-8555-555555555555";
const joinEvent: PlannedEventResponse = {
  ...plannedEvent,
  adminUserId: "creator",
  role: "member",
  canEdit: false,
  canInvite: false,
  groupId: optionId,
  groupType: "PRIVATE",
  dates: [...plannedEvent.dates, { id: alternativeId, day: "2030-06-05" }],
  locations: [
    ...plannedEvent.locations,
    { ...plannedEvent.locations[0], id: alternativeId, name: "Alternative venue" },
  ],
};
const joinTable: PlannedTableResponse = {
  ...plannedTable,
  adminUserId: "creator",
  canInvite: false,
  groupId: optionId,
  groupType: "PRIVATE",
  games: [...plannedTable.games, { gameId: 99, durationMinutes: 60, durationSource: "MANUAL" }],
  gamesDetail: [
    ...plannedTable.gamesDetail,
    { id: 99, name: "Alternative game", imageUrl: null, year: null },
  ],
};
const proposingEvent: PlannedEventResponse = {
  ...joinEvent,
  role: "participant",
  myRegistrations: [seat("owner")],
  canVote: true,
  canManage: false,
  canProposeDates: true,
  allowParticipantDates: true,
};
const proposingTable: PlannedTableResponse = {
  ...joinTable,
  myRegistration: seat("owner"),
  myPosition: "SEATED",
  canRegister: false,
};
const foreignEvent = { ...joinEvent, name: "Other account private event" };
const foreignTable = { ...joinTable, name: "Other account private table" };
let measurementKind: "join" | "proposal" = "join";
let activeClient: QueryClient | undefined;
const requests: string[] = [];
function currentClient() {
  if (!activeClient) throw new Error("Expected the measured participation Query owner");
  return activeClient;
}
function renderCached(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  activeClient = client;
  requests.length = 0;
  boundary.getToken.mockClear();
  boundary.back.mockClear();
  boundary.close.mockClear();
  client.setQueryData(
    eventRecordKeys.detail(options, plannedEvent.id),
    measurementKind === "join" ? joinEvent : proposingEvent,
  );
  client.setQueryData(
    eventRecordKeys.table(options, plannedEvent.id, plannedTable.id),
    measurementKind === "join" ? joinTable : proposingTable,
  );
  client.setQueryData(eventRecordKeys.detail(foreignOptions, plannedEvent.id), foreignEvent);
  client.setQueryData(
    eventRecordKeys.table(foreignOptions, plannedEvent.id, plannedTable.id),
    foreignTable,
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
      throw new Error(`Unexpected participation I/O: ${requests.at(-1)}`);
    }),
  );
  return renderWithI18n(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function cleanupCached() {
  cleanup();
  activeClient?.clear();
  activeClient = undefined;
}
configure({
  testingLibrary: { render: renderCached, cleanup: cleanupCached },
  runs: 10,
  warmupRuns: 1,
});
afterEach(() => {
  cleanupCached();
  vi.unstubAllGlobals();
});
afterAll(() => {
  if (boundary.previousApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = boundary.previousApi;
});
function assertNoSideEffects() {
  expect(requests).toEqual([]);
  expect(boundary.getToken).not.toHaveBeenCalled();
  expect(boundary.back).not.toHaveBeenCalled();
  expect(boundary.close).not.toHaveBeenCalled();
  expect(
    currentClient().getQueryData(eventRecordKeys.detail(foreignOptions, plannedEvent.id)),
  ).toBe(foreignEvent);
  expect(
    currentClient().getQueryData(
      eventRecordKeys.table(foreignOptions, plannedEvent.id, plannedTable.id),
    ),
  ).toBe(foreignTable);
  expect(screen.queryByText(foreignEvent.name)).toBeNull();
  expect(screen.queryByText(foreignTable.name)).toBeNull();
}

const joinScenario =
  "EventJoinSheet: cached ballot validation and tab reentry retain votes across capability changes";
test(joinScenario, async () => {
  measurementKind = "join";
  const result = await measureRenders(
    <EventJoinSheet eventId={plannedEvent.id} tableId={plannedTable.id} onClose={boundary.close} />,
    {
      scenario: async () => {
        expect(await screen.findByRole("dialog", { name: "Review table settings" })).toBeVisible();
        expect(await screen.findByRole("tab", { name: "Dates" })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        const join = screen.getByRole("button", { name: "Join table" });
        fireEvent.click(join);
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Answer every option and choose at least one Yes or If needed in each section.",
        );
        expect(screen.getByRole("group", { name: "2030-06-03 20:00" })).toHaveAttribute(
          "aria-invalid",
          "true",
        );
        fireEvent.click(screen.getByRole("button", { name: "2030-06-03 20:00: If needed" }));
        fireEvent.click(screen.getByRole("button", { name: "2030-06-05 20:00: No" }));
        fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
        fireEvent.click(await screen.findByRole("button", { name: "Club venue: Yes" }));
        fireEvent.click(screen.getByRole("button", { name: "Alternative venue: No" }));
        fireEvent.click(screen.getByRole("tab", { name: "Games" }));
        fireEvent.click(await screen.findByRole("button", { name: "Chess: If needed" }));
        fireEvent.click(screen.getByRole("button", { name: "Alternative game: No" }));
        expect(join).toBeEnabled();
        const revoked: PlannedTableResponse = { ...joinTable, canRegister: false };
        await act(async () =>
          currentClient().setQueryData(
            eventRecordKeys.table(options, plannedEvent.id, plannedTable.id),
            revoked,
          ),
        );
        await waitFor(() => expect(join).toBeDisabled());
        fireEvent.click(join);
        expect(screen.getByRole("button", { name: "Chess: If needed" })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await act(async () =>
          currentClient().setQueryData(
            eventRecordKeys.table(options, plannedEvent.id, plannedTable.id),
            joinTable,
          ),
        );
        await waitFor(() => expect(join).toBeEnabled());
        fireEvent.click(screen.getByRole("tab", { name: "Dates" }));
        expect(
          await screen.findByRole("button", { name: "2030-06-03 20:00: If needed" }),
        ).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
        expect(await screen.findByRole("button", { name: "Club venue: Yes" })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        fireEvent.click(screen.getByRole("tab", { name: "Games" }));
        expect(await screen.findByRole("button", { name: "Chess: If needed" })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        expect(currentClient().getQueryData(eventRecordKeys.detail(options, plannedEvent.id))).toBe(
          joinEvent,
        );
        expect(
          currentClient().getQueryData(
            eventRecordKeys.table(options, plannedEvent.id, plannedTable.id),
          ),
        ).toEqual(joinTable);
        assertNoSideEffects();
      },
    },
  );
  assertRenderMeasurement(result, joinScenario);
});

const proposalScenario =
  "EventProposalEditor: cached date validation and authority revocation retain the unsent draft";
test(proposalScenario, async () => {
  measurementKind = "proposal";
  const result = await measureRenders(
    <EventProposalEditor eventId={plannedEvent.id} kind="date" />,
    {
      scenario: async () => {
        const input = await screen.findByLabelText("Choose date and time");
        fireEvent.click(screen.getByRole("button", { name: "Send proposal" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid date and time.");
        fireEvent.change(input, { target: { value: "2030-06-04T19:15" } });
        expect(screen.queryByRole("alert")).toBeNull();
        expect(input).toHaveValue("2030-06-04T19:15");
        const revoked: PlannedEventResponse = { ...proposingEvent, canProposeDates: false };
        await act(async () =>
          currentClient().setQueryData(eventRecordKeys.detail(options, plannedEvent.id), revoked),
        );
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Proposals require an enabled category and your own seated participation in a private planning event.",
        );
        expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
        expect(screen.queryByLabelText("Choose date and time")).toBeNull();
        const fresh: PlannedEventResponse = { ...proposingEvent, version: 2 };
        await act(async () =>
          currentClient().setQueryData(eventRecordKeys.detail(options, plannedEvent.id), fresh),
        );
        expect(await screen.findByLabelText("Choose date and time")).toHaveValue(
          "2030-06-04T19:15",
        );
        expect(screen.getByRole("button", { name: "Send proposal" })).toBeEnabled();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
          currentClient().getQueryData(eventRecordKeys.detail(options, plannedEvent.id)),
        ).toEqual(fresh);
        expect(
          currentClient().getQueryData(
            eventRecordKeys.table(options, plannedEvent.id, plannedTable.id),
          ),
        ).toBe(proposingTable);
        assertNoSideEffects();
      },
    },
  );
  assertRenderMeasurement(result, proposalScenario);
});
