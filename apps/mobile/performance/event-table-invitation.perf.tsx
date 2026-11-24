import type { TableRegistration } from "@board-game-organizer/schemas";
import { eventRecordQuery, recordTableQuery, useRecordTable } from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { EventTableInvitationActions } from "@/components/events/EventTableInvitationActions";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent, plannedTable, seat } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://native-table-invitation-perf.test",
  token: async () => "table-invitation-fixture-token",
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "invitee",
    sessionId: "table-invitation-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.token,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: boundary.apiUrl } } },
}));

const options = {
  apiUrl: boundary.apiUrl,
  userId: "invitee",
  getToken: boundary.token,
  enabled: true,
};
const registration: TableRegistration = {
  ...seat("invitee", 7),
  id: "33333333-3333-4333-8333-333333333333",
  status: "PENDING",
};
const event = {
  ...plannedEvent,
  role: "invited" as const,
  myRegistrations: [registration],
};
const table = {
  ...plannedTable,
  myRegistration: registration,
  canRespond: true,
  canRegister: false,
  pendingCount: 1,
  eventVersion: event.version,
};
const eventPath = `/api/events/${event.id}`;
const tablePath = `${eventPath}/tables/${table.id}`;
const eventKey = eventRecordQuery(options, event.id).queryKey;
const tableKey = recordTableQuery(options, event.id, table.id).queryKey;

function PendingTableInvitation() {
  const entry = useRecordTable(options, event.id, table.id).data?.myRegistration;
  return entry ? <EventTableInvitationActions eventId={event.id} registration={entry} /> : null;
}

it("EventTableInvitationActions: decline the displayed version once and reconcile the decision", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const writes = vi.fn();
  const declined = {
    ...registration,
    status: "DECLINED" as const,
    version: registration.version + 1,
  };
  let current = registration;
  let currentVersion = event.version;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      expect(url.origin).toBe(boundary.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer table-invitation-fixture-token",
      );
      if (method === "GET") {
        const pending = current.status === "PENDING";
        const record = {
          ...table,
          myRegistration: current,
          canRespond: pending,
          pendingCount: pending ? 1 : 0,
          eventVersion: currentVersion,
        };
        if (url.pathname === tablePath) return Response.json(record);
        if (url.pathname === `${eventPath}/tables`)
          return Response.json({ items: [record], nextCursor: null });
        if (url.pathname === eventPath) {
          return Response.json({
            ...event,
            version: currentVersion,
            myRegistrations: current.status === "PENDING" ? [current] : [],
          });
        }
      }
      if (method === "PATCH" && url.pathname === `/api/table-registrations/${registration.id}`) {
        writes(JSON.parse(String(init?.body)));
        current = declined;
        currentVersion = event.version + 1;
        return Response.json({ ...declined, eventVersion: currentVersion });
      }
      throw new Error(`Unexpected table invitation request: ${method} ${url.pathname}`);
    }),
  );
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  }
  try {
    const measured = await measureRenders(<PendingTableInvitation />, {
      wrapper: Providers,
      beforeEach: () => {
        client.clear();
        client.setQueryData(eventKey, event);
        client.setQueryData(tableKey, table);
        current = registration;
        currentVersion = event.version;
        writes.mockClear();
      },
      scenario: async () => {
        expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
        const decline = screen.getByRole("button", { name: "Decline invitation" });
        expect(decline).toBeEnabled();
        expect(writes).not.toHaveBeenCalled();
        await userEvent.setup().press(decline);
        await waitFor(() =>
          expect(client.getQueryData(tableKey)).toMatchObject({
            eventVersion: event.version + 1,
            myRegistration: { status: "DECLINED", version: 8 },
          }),
        );
        expect(writes).toHaveBeenCalledExactlyOnceWith({ action: "decline", version: 7 });
        await waitFor(() =>
          expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull(),
        );
        expect(
          screen.queryByText("Review table settings", { includeHiddenElements: true }),
        ).toBeNull();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
    vi.unstubAllGlobals();
  }
});
