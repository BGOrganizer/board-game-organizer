import { URL } from "node:url";
import type {
  JoinTableInput,
  PlannedEventResponse,
  PlannedTableResponse,
  TableRegistration,
} from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventJoinSheet } from "../EventJoinSheet";

const API = "https://join-categories-native.test";
const sdk = vi.hoisted(() => ({
  token: vi.fn(async () => "category-owner-token"),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: sdk.token,
  }),
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiUrl: "https://join-categories-native.test" } },
  },
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
}));
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let registration: TableRegistration;
let writes: { method: string; path: string; body: unknown }[];
let unexpected: string[];
let tableGate: Promise<void> | undefined;
let releaseTable: (() => void) | undefined;
const secondDate = "44444444-4444-4444-8444-444444444444";
const secondLocation = "55555555-5555-4555-8555-555555555555";
beforeEach(() => {
  writes = [];
  unexpected = [];
  tableGate = undefined;
  releaseTable = undefined;
  sdk.token.mockClear();
  event = {
    ...plannedEvent,
    myVotes: { dateVotes: {}, locationVotes: {} },
    myRegistrations: [],
  };
  table = {
    ...plannedTable,
    myRegistration: null,
    canRegister: true,
    canRespond: false,
  };
  registration = {
    id: "33333333-3333-4333-8333-333333333333",
    eventId: event.id,
    tableId: table.id,
    userId: "owner",
    status: "PENDING",
    kind: "INVITATION",
    priorityAt: event.createdAt,
    sequence: 1,
    version: 7,
    gameVotes: {},
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const method = init?.method ?? "GET";
      if (
        url.origin !== API ||
        new Headers(init?.headers).get("Authorization") !== "Bearer category-owner-token"
      )
        throw new Error("Unexpected consent owner");
      if (method === "GET") {
        if (url.pathname === `/api/events/${event.id}`) return Response.json(event);
        if (url.pathname === `/api/events/${event.id}/tables/${table.id}`) {
          await tableGate;
          return Response.json(table);
        }
        if (url.pathname === `/api/events/${event.id}/tables`)
          return Response.json({ items: [table], nextCursor: null });
        if (
          url.pathname === "/api/events" ||
          url.pathname === "/api/groups" ||
          url.pathname.endsWith("/seats")
        )
          return Response.json({ items: [], nextCursor: null });
      }
      if (
        (method === "PATCH" && url.pathname === `/api/table-registrations/${registration.id}`) ||
        (method === "POST" &&
          url.pathname === `/api/events/${event.id}/tables/${table.id}/registrations`)
      ) {
        const body = JSON.parse(String(init?.body));
        writes.push({ method, path: url.pathname, body });
        const participation = (method === "PATCH" ? body.participation : body) as JoinTableInput;
        registration = {
          ...registration,
          kind: method === "PATCH" ? "INVITATION" : "SELF",
          status: "ACCEPTED",
          version: registration.version + 1,
          gameVotes: participation.gameVotes,
        };
        event = {
          ...event,
          version: event.version + 1,
          myRegistrations: [registration],
          ...(participation.availability
            ? {
                myVotes: {
                  dateVotes: participation.availability.dateVotes,
                  locationVotes: participation.availability.locationVotes,
                },
              }
            : {}),
        };
        table = {
          ...table,
          myRegistration: registration,
          canRespond: false,
          canRegister: false,
        };
        return Response.json({ ...registration, eventVersion: event.version });
      }
      unexpected.push(`${method} ${url.pathname}`);
      throw new Error("Unexpected consent endpoint");
    }),
  );
});
afterEach(async () => {
  await cleanup();
  releaseTable?.();
  await client.cancelQueries();
  client.clear();
  expect(unexpected).toEqual([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
// Singleton, all-three self-registration, and game-only returning participants
// already have actual native tests. These cases add only missing category/mode
// prerequisites. Real sheet/form/hooks/UI remain; Gorhom opening is STATE-only
// in Node, so callback/render assertions do not claim physical tappability.
it.each([
  { mask: 1, invitation: false },
  { mask: 2, invitation: false },
  { mask: 3, invitation: false },
  { mask: 5, invitation: false },
  { mask: 6, invitation: false },
  { mask: 4, invitation: true },
  { mask: 7, invitation: true },
])(
  "preserves exact multi-option categories and explicit consent (mask=$mask, invitation=$invitation)",
  async ({ mask, invitation }) => {
    if (mask & 1)
      event = {
        ...event,
        dates: [...event.dates, { id: secondDate, day: "2030-06-04" }],
      };
    if (mask & 2)
      event = {
        ...event,
        locations: [
          ...event.locations,
          { ...event.locations[0], id: secondLocation, name: "Second club" },
        ],
      };
    if (mask & 4)
      table = {
        ...table,
        games: [...table.games, { gameId: 2, durationMinutes: 60, durationSource: "BGG" }],
        gamesDetail: [
          ...table.gamesDetail,
          { id: 2, name: "Second chess", imageUrl: null, year: null },
        ],
      };
    if (invitation) {
      event = { ...event, myRegistrations: [registration] };
      table = {
        ...table,
        myRegistration: registration,
        canRegister: false,
        canRespond: true,
      };
    }
    const close = vi.fn();
    await render(
      <QueryClientProvider client={client}>
        <NativeTestProviders>
          <EventJoinSheet
            eventId={event.id}
            tableId={table.id}
            registrationId={invitation ? registration.id : undefined}
            onClose={close}
          />
        </NativeTestProviders>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("table-consent-submit", {
          includeHiddenElements: true,
        }),
      ).toBeEnabled(),
    );
    const names = [
      mask & 1 ? "Dates" : null,
      mask & 2 ? "Locations" : null,
      mask & 4 ? "Games" : null,
    ].filter((value): value is string => Boolean(value));
    const tabs = screen.getAllByRole("tab", { includeHiddenElements: true });
    expect(tabs).toHaveLength(names.length);
    for (const name of ["Dates", "Locations", "Games"]) {
      const tab = screen.queryByRole("tab", {
        name,
        includeHiddenElements: true,
      });
      if (names.includes(name)) expect(tab).toBeOnTheScreen();
      else expect(tab).toBeNull();
    }
    expect(
      screen.getByRole("tab", {
        name: names[0],
        selected: true,
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(writes).toEqual([]);
    expect(close).not.toHaveBeenCalled();
    const press = async (role: "tab" | "button", name: string) =>
      fireEvent.press(screen.getByRole(role, { name, includeHiddenElements: true }));
    await press("button", invitation ? "Accept invitation" : "Join table");
    expect(writes).toEqual([]);
    expect(
      screen.getByText(
        "Answer every option and choose at least one Yes or If needed in each section.",
        { includeHiddenElements: true },
      ),
    ).toBeOnTheScreen();
    for (const name of names) {
      await press("tab", name);
      const labels =
        name === "Dates"
          ? ["2030-06-03 20:00", "2030-06-04 20:00"]
          : name === "Locations"
            ? ["Club venue", "Second club"]
            : ["Chess", "Second chess"];
      await press("button", `${labels[0]}: Yes`);
      await press("button", `${labels[1]}: No`);
    }
    await press("button", invitation ? "Accept invitation" : "Join table");
    await waitFor(() => expect(writes).toHaveLength(1));
    const participation: JoinTableInput = {
      version: 1,
      gameVotes: mask & 4 ? { 1: "YES", 2: "NO" } : {},
      availability: {
        version: 1,
        dateVotes: mask & 1 ? { [plannedEvent.dates[0].id]: "YES", [secondDate]: "NO" } : {},
        locationVotes:
          mask & 2 ? { [plannedEvent.locations[0].id]: "YES", [secondLocation]: "NO" } : {},
      },
    };
    expect(writes[0]).toEqual(
      invitation
        ? {
            method: "PATCH",
            path: `/api/table-registrations/${registration.id}`,
            body: { action: "accept", version: 7, participation },
          }
        : {
            method: "POST",
            path: `/api/events/${event.id}/tables/${table.id}/registrations`,
            body: participation,
          },
    );
    expect(close).toHaveBeenCalledOnce();
  },
);

it("keeps explicit cancellation available while current table facts are still loading and never turns dismissal into consent", async () => {
  tableGate = new Promise<void>((finish) => {
    releaseTable = finish;
  });
  const close = vi.fn();
  await render(
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventJoinSheet eventId={event.id} tableId={table.id} onClose={close} />
      </NativeTestProviders>
    </QueryClientProvider>,
  );
  await screen.findByText("Club venue", { includeHiddenElements: true });
  expect(
    screen.getByTestId("table-consent-submit", { includeHiddenElements: true }),
  ).toBeDisabled();
  const cancel = screen.getByRole("button", {
    name: "Cancel",
    includeHiddenElements: true,
  });
  expect(cancel).toBeEnabled();
  expect(close).not.toHaveBeenCalled();
  await fireEvent.press(cancel);
  expect(close).toHaveBeenCalledOnce();
  expect(writes).toEqual([]);
});
