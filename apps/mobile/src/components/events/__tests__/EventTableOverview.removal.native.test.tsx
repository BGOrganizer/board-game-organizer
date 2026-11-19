import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  plannedEvent,
  plannedTable,
  seat,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventTableOverview } from "../EventTableOverview";

const API = "https://table-removal-native.test";
const sdk = vi.hoisted(() => ({ token: vi.fn(), push: vi.fn() }));
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
  default: { expoConfig: { extra: { apiUrl: "https://table-removal-native.test" } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: sdk.push }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => ({}),
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: { open: vi.fn(), dismiss: vi.fn() },
}));

const ownId = "44444444-4444-4444-8444-444444444444";
const guestId = "55555555-5555-4555-8555-555555555555";
let client: QueryClient;
let event: PlannedEventResponse;
let table: PlannedTableResponse;
let roster: TableSeatResponse[];
let response: Promise<Response>;
let finish: (receipt: Response) => void;
const writes: { path: string; input: unknown }[] = [];
const unexpected: string[] = [];
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks();
  sdk.token.mockResolvedValue("fresh-removal-owner");
  writes.length = unexpected.length = 0;
  roster = [
    {
      ...seat("owner"),
      id: ownId,
      seatIndex: 0,
      name: "Known owner",
      username: "known-owner",
      avatarUrl: "https://images.fixture.test/owner.png",
    },
    {
      ...seat("guest"),
      id: guestId,
      seatIndex: 1,
      sequence: 2,
      name: "Known guest",
      username: "known-guest",
      avatarUrl: "https://images.fixture.test/guest.png",
    },
  ];
  event = {
    ...plannedEvent,
    canManage: true,
    managementRole: "admin",
    myRegistrations: [roster[0]],
  };
  table = {
    ...plannedTable,
    canManage: true,
    canInvite: true,
    canLeave: true,
    canRegister: false,
    myRegistration: roster[0],
    myPosition: "SEATED",
    acceptedCount: 2,
    seatedCount: 2,
    occupiedSeatIndices: [0, 1],
    eventVersion: 1,
  };
  response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const method = init?.method ?? "GET";
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-removal-owner");
      if (
        method === "PATCH" &&
        [ownId, guestId].some((id) => url.pathname === `/api/table-registrations/${id}`)
      ) {
        writes.push({ path: url.pathname, input: JSON.parse(String(init?.body)) });
        return response;
      }
      if (method === "GET") {
        if (url.pathname === `/api/events/${event.id}`) return json(event);
        if (url.pathname === `/api/events/${event.id}/tables/${table.id}`) return json(table);
        if (url.pathname.endsWith("/seats"))
          return json({
            items: url.searchParams.get("pending") === "true" ? [] : roster,
            nextCursor: null,
          });
        if (url.pathname === `/api/events/${event.id}/tables`)
          return json({ items: [table], nextCursor: null });
        if (["/api/events", "/api/groups"].includes(url.pathname))
          return json({ items: [], nextCursor: null });
      }
      unexpected.push(`${method} ${url.pathname}`);
      throw new Error("Unexpected removal fixture request");
    }),
  );
});
afterEach(async () => {
  await cleanup();
  await client.cancelQueries();
  client.clear();
  expect(unexpected).toEqual([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// No app hook is replaced: the real API adapter, feedback, domain mutations,
// Query journal/ownership and native confirmation/roster all execute together.
it.each([false, true])(
  "captures all four recipient facts in public pending mutation variables after explicit removal consent (own=%s)",
  async (own) => {
    const prior = roster[own ? 0 : 1];
    const person = {
      userId: prior.userId,
      name: prior.name,
      username: prior.username,
      avatarUrl: prior.avatarUrl,
    };
    await render(
      <QueryClientProvider client={client}>
        <NativeTestProviders>
          <EventTableOverview eventId={event.id} tableId={table.id} section="participants" />
        </NativeTestProviders>
      </QueryClientProvider>,
    );
    await screen.findByText(`@${person.username}`);
    const user = userEvent.setup();
    await user.press(
      screen.getByRole("button", {
        name: own ? "Leave table" : `Remove player: @${person.username}`,
      }),
    );
    expect(writes).toEqual([]);
    expect(
      client
        .getMutationCache()
        .getAll()
        .filter((mutation) => mutation.state.status === "pending"),
    ).toHaveLength(0);
    await user.press(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    const pending = client
      .getMutationCache()
      .getAll()
      .filter((mutation) => mutation.state.status === "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].state.variables).toEqual({
      tableId: table.id,
      registrationId: prior.id,
      person,
      input: { action: own ? "cancel" : "remove", version: prior.version },
    });
    expect(writes[0]).toEqual({
      path: `/api/table-registrations/${prior.id}`,
      input: { action: own ? "cancel" : "remove", version: prior.version },
    });
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
    roster = roster.filter((row) => row.id !== prior.id);
    table = {
      ...table,
      acceptedCount: 1,
      seatedCount: 1,
      ...(own ? { myRegistration: null, canLeave: false } : {}),
    };
    await act(() =>
      finish(json({ ...prior, status: "CANCELLED", version: prior.version + 1, eventVersion: 2 })),
    );
    await waitFor(() => expect(pending[0].state.status).toBe("success"));
    expect(writes).toHaveLength(1);
    expect(sdk.push).not.toHaveBeenCalled();
  },
);
