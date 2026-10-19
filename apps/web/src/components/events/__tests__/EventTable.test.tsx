import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
import { eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, plannedEvent, plannedTable, seat, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTable } from "../EventTable";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
let table: PlannedTableResponse,
  rows: TableSeatResponse[],
  fail = false,
  fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  table = { ...plannedTable, myRegistration: seat("owner"), canRegister: false, canLeave: true };
  rows = [seat("owner")];
  fail = false;
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      if (fail) return new Response('{"error":"REGISTRATION_CHANGED"}', { status: 409 });
      const row = { ...rows[0], status: "CANCELLED" as const, version: 2 };
      rows = [];
      table = { ...table, myRegistration: row, canLeave: false, myPosition: null };
      return new Response(JSON.stringify(row));
    }
    return new Response(
      JSON.stringify(
        url.includes("/seats?")
          ? { items: rows, nextCursor: null }
          : url.includes(`/tables/${tableId}`)
            ? table
            : { ...plannedEvent, canVote: true },
      ),
    );
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
it.each([403, 503])(
  "retains an observable uncached table read error (%s) and retries the exact detail",
  async (status) => {
    const original = fetcher.getMockImplementation()!;
    let broken = true;
    fetcher.mockImplementation(async (url: string, init?: RequestInit) =>
      url.endsWith(`/tables/${tableId}`) && broken
        ? new Response("{}", { status })
        : original(url, init),
    );
    mount();
    expect(await screen.findByText("Could not load table")).not.toBeNull();
    broken = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(table.name)).not.toBeNull();
  },
);
it("keeps immutable scores while missing profiles fail/refetch, and orders ND after finishers without fabricated ratings", async () => {
  table = {
    ...table,
    eventStatus: "TERMINATED",
    canLeave: false,
    results: {
      lowerWins: false,
      entries: [
        { userId: "absent", score: null, rank: null },
        { userId: "owner", score: "10", rank: 1 },
        { userId: "guest", score: "5", rank: 2 },
        { userId: "other", score: null, rank: null },
      ],
      tieBreaks: [],
      finalizedAt: plannedEvent.createdAt,
    },
    ratingChanges: [{ userId: "owner", delta: 0, score: 500, provisional: true }],
    groupRatingChanges: [{ userId: "owner", delta: -3, score: 497, provisional: true }],
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    eventRecordKeys.table({ apiUrl: "https://api.test", userId: "owner" }, eventId, tableId),
    table,
    { updatedAt: 0 },
  );
  const original = fetcher.getMockImplementation()!;
  let broken = true;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) =>
    url.endsWith(`/tables/${tableId}`) && broken
      ? new Response("{}", { status: 503 })
      : original(url, init),
  );
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventTable eventId={eventId} tableId={tableId} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Could not load complete table details")).not.toBeNull();
  expect(screen.getByText("Score: 10")).not.toBeNull();
  expect(screen.getAllByText("Score: ND")).toHaveLength(2);
  expect(screen.getByText("Global rating change: 0")).not.toBeNull();
  expect(screen.getByText("Group rating change: -3")).not.toBeNull();
  broken = false;
  table = {
    ...table,
    resultProfiles: [
      { userId: "owner", name: "Recovered owner", email: "owner@example.test", avatarUrl: null },
    ],
  };
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Recovered owner")).not.toBeNull();
});
it("joins explicitly, votes only for its accepted registration, and exposes invitations to the authorized organizer", async () => {
  table = {
    ...table,
    canRegister: true,
    canLeave: false,
    canInvite: true,
    startsAt: "2030-06-03T18:00:00Z",
    demonstratorUserId: "demo",
    games: table.games.map((g) => ({ ...g, durationMinutes: undefined })),
    gamesDetail: table.gamesDetail.map((g) => ({
      ...g,
      year: 2000,
      imageUrl: "https://example.test/game.jpg",
    })),
  };
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response(JSON.stringify(url.endsWith("/votes") ? plannedEvent : seat("owner")))
      : original(url, init),
  );
  mount();
  expect(await screen.findByRole("link", { name: "Invite players" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Join table" }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: `${table.gamesDetail[0].name}: Yes` }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/votes") && JSON.parse(String(init?.body)).kind === "game",
      ),
    ).toBe(true),
  );
});
it("manages accepted/waiting/pending rosters, source paging and destructive removal without removing its own identity", async () => {
  table = { ...table, canInvite: true, canLeave: false };
  const guest = { ...seat("guest"), id: tableId, name: "Guest", position: "WAITING" as const };
  rows = [...rows, guest];
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      rows = rows.filter((r) => r.id !== guest.id);
      return new Response(JSON.stringify({ ...guest, status: "CANCELLED", version: 2 }));
    }
    if (url.includes("/seats?"))
      return new Response(
        JSON.stringify({
          items: new URL(url).searchParams.has("cursor") ? [] : rows,
          nextCursor: new URL(url).searchParams.has("cursor")
            ? null
            : `${guest.priorityAt}|1|${guest.id}`,
        }),
      );
    return original(url, init);
  });
  mount();
  expect(await screen.findByText("Waiting list")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove player: Guest" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove player: Guest" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)),
  ).toMatchObject({ action: "remove", version: 1 });
  rows = [{ ...guest, name: null, status: "PENDING", position: "SEATED" }];
  fireEvent.click(screen.getByRole("button", { name: "Pending invitations" }));
  expect(await screen.findByText("Invitation pending")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove player: guest" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([url]) => url.includes("cursor="))).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
});
it("retries failed seat reads, preserves a visible empty state and does not render failed access as usable private detail", async () => {
  let broken = true;
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (url: string, init?: RequestInit) =>
    url.includes("/seats?")
      ? broken
        ? new Response("{}", { status: 503 })
        : new Response('{"items":[],"nextCursor":null}')
      : original(url, init),
  );
  mount();
  expect(await screen.findByText("Could not load players")).not.toBeNull();
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No players found")).not.toBeNull();
});
it("renders confirmed timing and email rows without game voting, and handles unknown complete table reads", async () => {
  table = {
    ...table,
    eventStatus: "CONFIRMED",
    canLeave: false,
    adminUserId: "other",
    canInvite: false,
    demonstratorUserId: "demo",
    demonstratorName: "Guide",
    startsAt: "2030-06-03T18:00:00Z",
    confirmed: {
      gameId: 1,
      playerIds: ["owner"],
      startsAt: "2030-06-03T18:00:00Z",
      endsAt: "2030-06-03T19:00:00Z",
    },
    games: table.games.map((g) => ({ ...g, durationMinutes: 60 })),
  };
  rows = [{ ...rows[0], email: "owner@example.test", name: null }];
  mount();
  expect(await screen.findByText("owner@example.test")).not.toBeNull();
  expect(screen.getByText(/Guide/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: /Yes/ })).toBeNull();
});
function mount() {
  renderWithI18n(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <EventTable eventId={eventId} tableId={tableId} />
    </QueryClientProvider>,
  );
}
it("uses explicit accepted seats/game votes and confirms departure before deleting participation", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Leave table" }));
  expect(fetcher.mock.calls.some(([url]) => url.includes("table-registrations/"))).toBe(false);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull());
  const call = fetcher.mock.calls.find(([url]) => url.includes("table-registrations/"));
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ action: "cancel", version: 1 });
});
it("retains failed destructive confirmations and does not hide the API error as an empty list", async () => {
  fail = true;
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Leave table" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  expect(await screen.findByText("Could not update table registration")).not.toBeNull();
  expect(screen.getByRole("dialog")).not.toBeNull();
  expect(screen.getByText("owner")).not.toBeNull();
});
it("shows immutable avatars, all tied positions, emails, exact scores and both rating deltas", async () => {
  table = {
    ...table,
    eventStatus: "TERMINATED",
    canLeave: false,
    canInvite: false,
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
    results: {
      lowerWins: false,
      entries: [
        { userId: "owner", rank: 1, score: "1.50" },
        { userId: "guest", rank: 1, score: "1.5" },
      ],
      tieBreaks: [],
      finalizedAt: "2030-06-03T22:00:00Z",
    },
    resultProfiles: [
      { userId: "owner", name: "Owner", email: "owner@example.test", avatarUrl: null },
      { userId: "guest", name: "Guest", email: "guest@example.test", avatarUrl: null },
    ],
    ratingChanges: [{ userId: "owner", score: 505, delta: 5, provisional: true }],
    groupRatingChanges: [{ userId: "owner", score: 507, delta: 7, provisional: true }],
  };
  mount();
  expect(await screen.findByText("owner@example.test")).not.toBeNull();
  expect(screen.getByText("guest@example.test")).not.toBeNull();
  expect(screen.getByText("Score: 1.50")).not.toBeNull();
  expect(screen.getByText("Global rating change: +5")).not.toBeNull();
  expect(screen.getByText("Group rating change: +7")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Chess: Yes" })).toBeNull();
});
it("rechecks exact public cutoff locally rather than exposing stale invitation/removal controls", async () => {
  table = {
    ...table,
    groupType: "PUBLIC",
    bookingClosesAt: "2000-01-01T00:00:00Z",
    canRegister: true,
    canInvite: true,
    canLeave: true,
    canRespond: true,
    myRegistration: { ...seat("owner"), status: "PENDING" },
  };
  mount();
  await screen.findByRole("link", { name: "Open table: First table" });
  for (const name of ["Join table", "Leave table", "Accept invitation", "Decline invitation"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByRole("link", { name: "Invite players" })).toBeNull();
});
