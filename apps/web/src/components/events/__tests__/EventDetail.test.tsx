import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventDetail } from "../EventDetail";

const mocks = vi.hoisted(() => ({ feedback: { onOptimisticUpdate: vi.fn(), onError: vi.fn() } }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
    feedback: mocks.feedback,
  }),
}));
let event: PlannedEventResponse,
  tables: PlannedTableResponse[],
  fail = false,
  failWrite = false,
  fetcher: ReturnType<typeof vi.fn>;
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventDetail eventId={eventId} />
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  event = { ...plannedEvent };
  tables = [{ ...plannedTable }];
  fail = false;
  failWrite = false;
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (fail) return new Response("{}", { status: 503 });
    if (init?.method === "PATCH") {
      if (failWrite) return new Response('{"error":"EVENT_CHANGED"}', { status: 409 });
      const input = JSON.parse(String(init.body));
      if (url.endsWith("/state")) {
        event = {
          ...event,
          status: input.action === "confirm" ? "CONFIRMED" : "PLANNING",
          version: event.version + 1,
          canConfirm: false,
          canEdit: false,
          canReplan: true,
        };
      } else if (url.endsWith("/votes"))
        event = {
          ...event,
          myVotes: { dateVotes: { [input.optionId]: input.vote }, locationVotes: {} },
        };
      return new Response(JSON.stringify(event));
    }
    return new Response(
      JSON.stringify(url.includes("/tables?") ? { items: tables, nextCursor: null } : event),
    );
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
it("keeps terminated events read-only when no planning agreement is returned", async () => {
  event = {
    ...event,
    status: "TERMINATED",
    agreement: undefined,
    canVote: false,
    canEdit: false,
    canConfirm: false,
    canReplan: false,
    canFinalize: false,
  };
  tables = [];
  mount();
  expect(await screen.findByText(/Terminated/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm event" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reopen planning" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Yes/ })).toBeNull();
});
it("hides an inaccessible event rather than retaining private content after authorization failure", async () => {
  fetcher.mockImplementation(async () => new Response('{"error":"FORBIDDEN"}', { status: 403 }));
  mount();
  expect(await screen.findByText("Could not load event")).not.toBeNull();
  expect(screen.queryByRole("heading", { name: plannedEvent.name })).toBeNull();
});
it("hydrates missing agreement/table fields from a canonical list summary without enabling confirmation early", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    summary = {
      ...plannedEvent,
      groupId: "55555555-5555-4555-8555-555555555555",
      groupName: null,
      canConfirm: true,
      agreement: undefined,
    };
  client.setQueryData(eventRecordKeys.list({ apiUrl: "https://api.test", userId: "owner" }), {
    pages: [{ items: [summary], nextCursor: null }],
    pageParams: [""],
  });
  let release!: () => void;
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/tables?"))
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return original(url, init);
  });
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventDetail eventId={eventId} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { name: plannedEvent.name })).not.toBeNull();
  expect(
    (screen.getByRole("button", { name: "Confirm event" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await waitFor(() => expect(release).toBeTypeOf("function"));
  await act(async () => release());
  expect(await screen.findByRole("link", { name: "Open table: First table" })).not.toBeNull();
});
it("retries uncached event and table failures instead of turning them into empty success", async () => {
  fail = true;
  mount();
  expect(await screen.findByText("Could not load event")).not.toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: plannedEvent.name })).not.toBeNull();
  const retry = screen.queryByRole("button", { name: "Try again" });
  if (retry) fireEvent.click(retry);
  expect(await screen.findByRole("link", { name: "Open table: First table" })).not.toBeNull();
});
it("confirms manually, permits replan after cutoff, and keeps failed transitions actionable", async () => {
  event = {
    ...event,
    status: "CONFIRMED",
    canVote: false,
    canEdit: false,
    canConfirm: false,
    canReplan: true,
    canFinalize: true,
    groupId: "55555555-5555-4555-8555-555555555555",
    groupName: "Our group",
    groupType: "PUBLIC",
    bookingClosesAt: "2000-01-01T00:00:00Z",
    endsAt: "2030-06-04T01:00:00Z",
    confirmed: {
      dateId: plannedEvent.dates[0].id,
      locationId: plannedEvent.locations[0].id,
      at: "2030-06-01T12:00:00Z",
    },
  };
  mount();
  expect(await screen.findByRole("link", { name: "Our group" })).not.toBeNull();
  expect(screen.getByRole("link", { name: "Register results" }).getAttribute("href")).toContain(
    "/results",
  );
  expect(screen.queryByRole("link", { name: "Edit event" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reopen planning" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  failWrite = true;
  fireEvent.click(screen.getByRole("button", { name: "Reopen planning" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  expect(
    await screen.findByText("Could not change event state. Refresh and try again."),
  ).not.toBeNull();
  failWrite = false;
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    fetcher.mock.calls.some(
      ([url, init]) => url.endsWith("/state") && JSON.parse(String(init?.body)).action === "replan",
    ),
  ).toBe(true);
});
it("renders pending/unavailable agreements, location votes, paging and manual confirmation", async () => {
  event = {
    ...event,
    canVote: true,
    canConfirm: true,
    myVotes: undefined,
    agreement: {
      agreed: true,
      dateId: plannedEvent.dates[0].id,
      locationId: plannedEvent.locations[0].id,
      tables: [],
      reasons: [
        { tableId: plannedTable.id, code: "PENDING_RESERVATIONS" },
        { tableId: "77777777-7777-4777-8777-777777777777", code: "GAME_DISAGREEMENT" },
        { tableId: "88888888-8888-4888-8888-888888888888", code: "NO_AGREEMENT" },
      ],
    },
  };
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/tables?"))
      return new Response(
        JSON.stringify(
          new URL(url).searchParams.has("cursor")
            ? {
                items: [
                  {
                    ...plannedTable,
                    id: "77777777-7777-4777-8777-777777777777",
                    name: "Second table",
                  },
                ],
                nextCursor: null,
              }
            : { items: tables, nextCursor: "0" },
        ),
      );
    return original(url, init);
  });
  mount();
  expect(
    await screen.findByText("Agreement available. Confirmation remains manual."),
  ).not.toBeNull();
  expect(screen.getByText(/Pending invitations still reserve places/)).not.toBeNull();
  expect(screen.getByText(/No compatible accepted players/)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByRole("link", { name: "Open table: Second table" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: `${plannedEvent.locations[0].name}: Yes` }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          url.endsWith("/votes") && JSON.parse(String(init?.body)).kind === "location",
      ),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm event" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("opens unified event/table routes and uses one voting legend with no legacy draft/delete actions", async () => {
  mount();
  expect(await screen.findByRole("heading", { name: event.name })).not.toBeNull();
  expect(screen.getAllByRole("button", { name: "Voting legend" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Edit event" }).getAttribute("href")).toBe(
    `/events/${eventId}/edit`,
  );
  expect(await screen.findByRole("link", { name: "Open table: First table" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Delete event" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Confirm event/ })).toBeNull();
});
it("only accepted players may vote, and voting never creates a table registration", async () => {
  event = { ...event, canVote: true };
  mount();
  const vote = await screen.findByRole("button", { name: "2030-06-03: Yes" });
  fireEvent.click(vote);
  await waitFor(() =>
    expect(mocks.feedback.onOptimisticUpdate).toHaveBeenCalledWith("set_event_vote"),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/votes") && JSON.parse(String(init?.body)).kind === "date",
      ),
    ).toBe(true),
  );
  expect(fetcher.mock.calls.some(([url]) => url.includes("/registrations"))).toBe(false);
});
it("explains seated game disagreement without replacing players by waiters", async () => {
  event = {
    ...event,
    agreement: {
      agreed: false,
      tables: [],
      reasons: [{ tableId: plannedTable.id, code: "GAME_DISAGREEMENT" }],
    },
  };
  mount();
  expect(await screen.findByText(/Seated players agree on date and location/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm event" })).toBeNull();
});
it("requires explicit manual confirmation and freezes only server-authorized agreement", async () => {
  event = { ...event, canConfirm: true, agreement: { agreed: true, tables: [], reasons: [] } };
  const client = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Confirm event" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("Other tables and invitations are retained but excluded.");
  expect(fetcher.mock.calls.some(([url]) => url.endsWith("/state"))).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(
      client.getQueryData(
        eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
      ),
    ).toMatchObject({ status: "CONFIRMED" }),
  );
  expect(mocks.feedback.onOptimisticUpdate).toHaveBeenCalledWith("confirm_event");
});
it("leaves failed confirmation actionable and selectively restores optimistic capabilities", async () => {
  event = { ...event, canConfirm: true };
  failWrite = true;
  const client = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Confirm event" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  expect(
    await screen.findByText("Could not change event state. Refresh and try again."),
  ).not.toBeNull();
  expect(screen.getByRole("dialog")).not.toBeNull();
  expect(
    client.getQueryData(
      eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
    ),
  ).toMatchObject({ status: "PLANNING", canConfirm: true });
  expect(mocks.feedback.onError).toHaveBeenCalled();
});
it("preserves an observable error/retry path instead of treating failures as empty success", async () => {
  fail = true;
  mount();
  expect(await screen.findByText("Could not load event")).not.toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: event.name })).not.toBeNull();
});
it("closed public cutoff blocks editing/voting without preventing manual confirmation", async () => {
  event = {
    ...event,
    groupType: "PUBLIC",
    bookingClosesAt: "2000-01-01T00:00:00Z",
    canVote: true,
    canConfirm: true,
  };
  mount();
  expect(await screen.findByRole("button", { name: "Confirm event" })).not.toBeNull();
  expect(screen.queryByRole("link", { name: "Edit event" })).toBeNull();
  expect(screen.queryByRole("button", { name: "2030-06-03: Yes" })).toBeNull();
});
