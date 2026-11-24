import type {
  EventProposalResponse,
  PlannedTableResponse,
  TableSeatOrderSnapshot,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, userEvent, waitFor, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { EventFinalizeAction } from "@/components/events/EventFinalizeAction";
import { EventProposalSection } from "@/components/events/EventProposalSection";
import { EventTableSeats } from "@/components/events/EventTableSeats";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent, plannedTable, seat } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://native-administration-perf.test",
  getToken: async () => "administration-fixture-token",
  push: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "administration-fixture-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: boundary.apiUrl } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: boundary.push }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => ({}),
}));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: { open: vi.fn(), dismiss: vi.fn() },
}));

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

function providers(client: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  };
}

function ownedUrl(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : input);
  expect(url.origin).toBe(boundary.apiUrl);
  expect(new Headers(init?.headers).get("authorization")).toBe(
    "Bearer administration-fixture-token",
  );
  return url;
}

afterEach(() => vi.unstubAllGlobals());

it("EventProposalSection: review an authorized proposal and dismiss it without a decision", async () => {
  const client = createClient();
  const event = {
    ...plannedEvent,
    allowParticipantLocations: true,
    canManage: true,
    managementRole: "admin" as const,
  };
  const proposal: EventProposalResponse = {
    id: "66666666-6666-4666-8666-666666666666",
    eventId: plannedEvent.id,
    groupId: null,
    userId: "proposer",
    clientRequestId: "77777777-7777-4777-8777-777777777777",
    payload: { kind: "location", location: plannedEvent.locations[0] },
    label: "Club venue",
    status: "PENDING",
    version: 1,
    submittedEventVersion: 1,
    createdAt: plannedEvent.createdAt,
    updatedAt: plannedEvent.updatedAt,
    authorName: "Proposing Player",
    authorUsername: "@proposer",
  };
  const reads = vi.fn();
  const writes = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = ownedUrl(input, init);
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        writes(method, url.pathname);
        throw new Error("The review cannot write without a decision");
      }
      reads(url.pathname);
      if (url.pathname === `/api/events/${event.id}/proposals`) {
        return Response.json({
          eventId: event.id,
          groupId: null,
          eventVersion: event.version,
          mode: "review",
          items: [proposal],
          nextCursor: null,
        });
      }
      throw new Error(`Unexpected proposal request: ${url.pathname}`);
    }),
  );
  try {
    const measured = await measureRenders(<EventProposalSection event={event} kind="location" />, {
      wrapper: providers(client),
      beforeEach: () => {
        client.clear();
        reads.mockClear();
        writes.mockClear();
      },
      scenario: async () => {
        const heading = screen.getByText("Proposed locations");
        expect(heading).toBeVisible();
        expect(heading).toHaveProp("accessibilityRole", "header");
        const row = await screen.findByTestId(`event-proposal-${proposal.id}`);
        const review = within(row).getByRole("button", { name: /^Review proposal:/ });
        const user = userEvent.setup();
        await user.press(review);
        const dialog = within(await screen.findByTestId("confirmation-dialog"));
        expect(dialog.getByText("@proposer")).toBeVisible();
        expect(dialog.getByRole("button", { name: "Accept" })).toBeEnabled();
        expect(dialog.getByRole("button", { name: "Reject" })).toBeEnabled();
        expect(reads).toHaveBeenCalledWith(`/api/events/${event.id}/proposals`);
        expect(writes).not.toHaveBeenCalled();
        await user.press(dialog.getByRole("button", { name: "Cancel" }));
        expect(
          screen.queryByTestId("confirmation-dialog", { includeHiddenElements: true }),
        ).toBeNull();
        expect(review).toBeEnabled();
        expect(writes).not.toHaveBeenCalled();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});

it("EventTableSeats: preserve the locked participant and submit only the explicit versioned reorder", async () => {
  const client = createClient();
  const ownerId = "44444444-4444-4444-8444-444444444444";
  const bobId = "55555555-5555-4555-8555-555555555555";
  const pendingId = "66666666-6666-4666-8666-666666666666";
  const waitingId = "77777777-7777-4777-8777-777777777777";
  const player = (userId: string, id: string, change: Partial<TableSeatResponse> = {}) => ({
    ...seat(userId),
    id,
    name: `${userId} Player`,
    seatIndex: 0,
    ...change,
  });
  const registrations = [
    player("owner", ownerId),
    player("bob", bobId, { seatIndex: 1, sequence: 2, locked: true }),
    player("pending", pendingId, { status: "PENDING", seatIndex: 2, sequence: 3 }),
    player("waiting", waitingId, { seatIndex: null, position: "WAITING", sequence: 4 }),
  ];
  const table: PlannedTableResponse = {
    ...plannedTable,
    canManage: true,
    canLeave: true,
    canInvite: true,
    eventVersion: 1,
    myRegistration: registrations[0],
    myPosition: "SEATED",
    seatedCount: 2,
    pendingCount: 1,
    waitingCount: 1,
    occupiedSeatIndices: [0, 1, 2],
  };
  const snapshot: TableSeatOrderSnapshot = {
    version: 1,
    allocationKey: "allocation-one",
    capacity: 4,
    seatedCount: 3,
    registrations,
  };
  const eventPath = `/api/events/${table.eventId}`;
  const tablePath = `${eventPath}/tables/${table.id}`;
  const writes = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = ownedUrl(input, init);
      if (url.pathname === `${tablePath}/seats/order`) {
        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body));
          writes(body);
          return Response.json({
            ...snapshot,
            version: snapshot.version + 1,
            registrations: registrations.map((row) => ({
              ...row,
              ...(body.registrations as { id: string }[]).find((entry) => entry.id === row.id),
            })),
          });
        }
        return Response.json(snapshot);
      }
      if (url.pathname === `${tablePath}/seats`) {
        return Response.json({
          items: registrations.filter(
            (row) => (row.status === "PENDING") === (url.searchParams.get("pending") === "true"),
          ),
          nextCursor: null,
        });
      }
      if (url.pathname === eventPath) return Response.json(plannedEvent);
      if (url.pathname === tablePath) return Response.json(table);
      if (url.pathname === `${eventPath}/tables`)
        return Response.json({ items: [table], nextCursor: null });
      throw new Error(`Unexpected seat order request: ${url.pathname}`);
    }),
  );
  try {
    const measured = await measureRenders(
      <EventTableSeats table={table} header={null} onRemove={() => {}} />,
      {
        wrapper: providers(client),
        beforeEach: () => {
          client.clear();
          writes.mockClear();
        },
        scenario: async () => {
          expect(await screen.findByText("@bob")).toBeVisible();
          const user = userEvent.setup();
          await user.press(screen.getByRole("button", { name: "Reorder seats" }));
          expect(await screen.findByTestId(`seat-order-row-${ownerId}`)).toBeVisible();
          expect(screen.getByTestId(`seat-order-lock-${bobId}`)).toHaveAccessibleName(
            "Unlock player",
          );
          await user.press(screen.getByTestId(`seat-order-down-${ownerId}`));
          expect(writes).not.toHaveBeenCalled();
          await user.press(screen.getByRole("button", { name: "Save seat order" }));
          await waitFor(() =>
            expect(writes).toHaveBeenCalledExactlyOnceWith(
              expect.objectContaining({
                version: 1,
                allocationKey: "allocation-one",
                registrations: expect.arrayContaining([
                  { id: ownerId, version: 1, locked: false, seatIndex: 2 },
                  { id: bobId, version: 1, locked: true, seatIndex: 1 },
                  { id: pendingId, version: 1, locked: false, seatIndex: 0 },
                ]),
              }),
            ),
          );
          await waitFor(() => expect(screen.queryByTestId("seat-order-list")).toBeNull());
        },
      },
    );
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});

it("EventFinalizeAction: review immutable results and discard the private share opt-in on cancellation", async () => {
  const client = createClient();
  const event = {
    ...plannedEvent,
    groupId: "33333333-3333-4333-8333-333333333333",
    visibility: "PRIVATE" as const,
    groupType: "PRIVATE" as const,
    status: "CONFIRMED" as const,
    canFinalize: true,
    canManage: true,
    managementRole: "admin" as const,
    resultsReady: true,
  };
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  try {
    const measured = await measureRenders(<EventFinalizeAction event={event} />, {
      wrapper: providers(client),
      beforeEach: () => {
        client.clear();
        fetch.mockClear();
      },
      scenario: async () => {
        const trigger = screen.getByTestId("event-finalize-results");
        expect(trigger).toBeEnabled();
        const user = userEvent.setup();
        await user.press(trigger);
        expect(
          screen.getByText(
            "Results and ratings for all included tables become immutable together.",
          ),
        ).toBeVisible();
        const label = "Share results with participants' friends";
        const share = screen.getByRole("switch", { name: label });
        expect(share).not.toBeChecked();
        await user.press(share);
        expect(share).toBeChecked();
        await user.press(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
        await user.press(trigger);
        expect(screen.getByRole("switch", { name: label })).not.toBeChecked();
        expect(fetch).not.toHaveBeenCalled();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    client.clear();
  }
});
