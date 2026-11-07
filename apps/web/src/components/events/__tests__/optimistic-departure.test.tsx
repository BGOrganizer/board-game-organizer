import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  clearSessionQueryCache,
  eventRecordKeys,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  eventId,
  optionId,
  plannedEvent,
  plannedTable,
  seat,
  tableId,
} from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableOverview } from "../EventTableOverview";

const mocks = vi.hoisted(() => ({ options: {} as CommunityApiOptions }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => mocks.options }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("fails closed when own registration vanishes before confirmation even if cached capability metadata still lags", async () => {
  mocks.options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
    feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() },
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const registration = seat("owner");
  const table = {
    ...plannedTable,
    myRegistration: registration,
    canLeave: true,
    canRegister: false,
  };
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) =>
    Response.json(
      url.includes("/seats?")
        ? { items: url.includes("pending=true") ? [] : [registration], nextCursor: null }
        : url.includes("/tables/")
          ? table
          : { ...plannedEvent, myRegistrations: [registration], canVote: true },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventTableOverview eventId={eventId} tableId={tableId} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Leave table" }));
  await act(async () => {
    client.setQueryData(eventRecordKeys.table(mocks.options, eventId, tableId), {
      ...table,
      myRegistration: null,
    });
    // Flush Query's batched notification before pressing the already-open dialog.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  expect(mocks.options.feedback?.onOptimisticUpdate).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
  clearSessionQueryCache(client);
});
it.each([
  [false, true],
  [false, false],
  [true, true],
  [true, false],
])(
  "closes departure before PATCH, updates only the owned participation and rolls back a definite rejection: otherTable=%s commit=%s",
  async (otherTable, committed) => {
    const options = {
      apiUrl: "https://api.test",
      userId: "owner",
      getToken: vi.fn(async () => "fresh"),
      feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
    };
    mocks.options = options;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
    const registration = { ...seat("owner"), name: "Owner", gameVotes: { "1": "YES" as const } };
    const other = {
      ...registration,
      id: "66666666-6666-4666-8666-666666666666",
      tableId: optionId,
    };
    let server: PlannedEventResponse = {
      ...plannedEvent,
      groupId: optionId,
      groupType: "PUBLIC",
      groupName: "Public club",
      participantCount: 1,
      tableCount: otherTable ? 2 : 1,
      myRegistrations: [registration, ...(otherTable ? [other] : [])],
      canVote: true,
      canConfirm: false,
      endsAt: "2030-06-03T21:00:00Z",
      bookingClosesAt: "2030-06-02T18:00:00Z",
    };
    let table: PlannedTableResponse = {
      ...plannedTable,
      groupId: optionId,
      groupType: "PUBLIC",
      groupName: server.groupName,
      startsAt: "2030-06-03T18:00:00Z",
      acceptedCount: 1,
      seatedCount: 1,
      myRegistration: registration,
      myPosition: "SEATED",
      canLeave: true,
      canRegister: false,
    };
    let departed = false;
    let release: ((response: Response) => void) | undefined;
    const writes: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          writes.push(JSON.parse(String(init.body)));
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        }
        if (url.includes("/seats?"))
          return Response.json({
            items:
              departed || new URL(url).searchParams.get("pending") === "true" ? [] : [registration],
            nextCursor: null,
          });
        return Response.json(url.includes(`/tables/${tableId}`) ? table : server);
      }),
    );
    client.setQueryData(eventRecordKeys.detail(options, eventId), server);
    client.setQueryData(eventRecordKeys.table(options, eventId, tableId), table);
    renderWithI18n(
      <QueryClientProvider client={client}>
        <EventTableOverview eventId={eventId} tableId={tableId} />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Leave table" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(release).toBeDefined());
    expect(writes).toEqual([{ action: "cancel", version: registration.version }]);
    const roster = within(screen.getByRole("region", { name: "Seats list" }));
    expect(roster.queryByText("Owner")).toBeNull();
    const intent = client.getQueryData(
      eventRecordKeys.detail(options, eventId),
    ) as PlannedEventResponse;
    expect(intent.myRegistrations.map((row) => row.id)).toEqual(otherTable ? [other.id] : []);
    expect(intent.canVote).toBe(otherTable);
    expect(intent.participantCount).toBe(otherTable ? 1 : 0);
    expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("leave_table");
    const respond = release;
    if (!respond) throw new Error("Missing held departure response");
    if (committed) {
      departed = true;
      server = {
        ...server,
        version: 2,
        myRegistrations: otherTable ? [other] : [],
        canVote: otherTable,
        participantCount: otherTable ? 1 : 0,
      };
      table = {
        ...table,
        myRegistration: null,
        myPosition: null,
        acceptedCount: 0,
        seatedCount: 0,
        canLeave: false,
        canRegister: true,
      };
      await act(async () =>
        respond(
          Response.json({ ...registration, status: "CANCELLED", version: 2, eventVersion: 2 }),
        ),
      );
      await waitFor(() => expect(roster.queryByText("Owner")).toBeNull());
    } else {
      await act(async () =>
        respond(Response.json({ error: "REGISTRATION_CHANGED" }, { status: 409 })),
      );
      await waitFor(() => expect(roster.getByText("Owner")).toBeTruthy());
      const restored = client.getQueryData(
        eventRecordKeys.detail(options, eventId),
      ) as PlannedEventResponse;
      expect(restored.myRegistrations).toEqual(server.myRegistrations);
      expect(restored.canVote).toBe(true);
      expect(restored.participantCount).toBe(1);
      expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "leave_table");
    }
    expect(writes).toHaveLength(1);
    expect(options.feedback.onSuccess).not.toHaveBeenCalled();
    cleanup();
    clearSessionQueryCache(client);
  },
);
