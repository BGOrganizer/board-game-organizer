import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
import { eventRecordKeys, eventVoteCounts } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  eventId,
  optionId,
  plannedEvent,
  plannedTable,
  seat,
  tableId,
} from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTable } from "../EventTable";

const m = vi.hoisted(() => ({ actor: "owner", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: m.actor,
    getToken: async () => "fresh",
  }),
}));
let table: PlannedTableResponse,
  rows: TableSeatResponse[],
  fail = false,
  paged = false,
  acceptedElsewhere = false,
  fetcher: ReturnType<typeof vi.fn>;
function player(user: string, id = optionId): TableSeatResponse {
  return { ...seat(user), id };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.actor = "owner";
  fail = false;
  paged = false;
  acceptedElsewhere = false;
  rows = [player("owner")];
  table = {
    ...plannedTable,
    myRegistration: rows[0],
    myPosition: "SEATED",
    seatedCount: 1,
    canRegister: false,
    canLeave: true,
    gameVoteCounts: { "1": { YES: 0, NO: 0, IF_NEEDED: 0, UNKNOWN: 1 } },
  };
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      if (fail) return new Response('{"code":"EVENT_BOOKING_CLOSED"}', { status: 409 });
      const row = {
        ...player(m.actor),
        kind: "SELF" as const,
        gameVotes: JSON.parse(String(init.body)).gameVotes,
      };
      rows.push(row);
      table = {
        ...table,
        myRegistration: row,
        myPosition: "SEATED",
        canRegister: false,
        canLeave: true,
        seatedCount: rows.filter((r) => r.status === "ACCEPTED").length,
      };
      return new Response(JSON.stringify(row));
    }
    if (init?.method === "PATCH") {
      if (fail) return new Response('{"code":"REGISTRATION_CHANGED"}', { status: 409 });
      const input = JSON.parse(String(init.body));
      if (url.endsWith("/votes")) {
        const registration = table.myRegistration;
        if (registration) {
          table = {
            ...table,
            myRegistration: {
              ...registration,
              gameVotes: { ...registration.gameVotes, [input.gameId]: input.vote },
            },
          };
          rows = rows.map((r) =>
            r.id === registration.id
              ? { ...r, gameVotes: table.myRegistration?.gameVotes ?? {} }
              : r,
          );
        }
        return new Response(JSON.stringify({ ...plannedEvent, canVote: true }));
      }
      const target = rows.find((r) => url.endsWith(`/${r.id}`));
      if (!target) return new Response("{}", { status: 404 });
      const next = {
        ...target,
        status:
          input.action === "accept"
            ? ("ACCEPTED" as const)
            : input.action === "decline"
              ? ("DECLINED" as const)
              : ("CANCELLED" as const),
        version: target.version + 1,
      };
      rows = rows.filter((r) => r.id !== next.id);
      if (next.status === "ACCEPTED") rows.push(next);
      if (target.userId === m.actor)
        table = {
          ...table,
          myRegistration: next.status === "ACCEPTED" ? next : null,
          canRegister: next.status !== "ACCEPTED",
          canRespond: false,
          canLeave: next.status === "ACCEPTED",
        };
      return new Response(JSON.stringify(next));
    }
    if (url.includes("/seats?")) {
      const query = new URL(url).searchParams,
        pending = query.get("pending") === "true";
      if (pending && m.actor !== table.adminUserId) return new Response("{}", { status: 403 });
      const selected = rows.filter((r) => r.status === (pending ? "PENDING" : "ACCEPTED"));
      return new Response(
        JSON.stringify({
          items: paged
            ? query.has("cursor")
              ? selected.slice(1)
              : selected.slice(0, 1)
            : selected,
          nextCursor: paged && selected.length > 1 && !query.has("cursor") ? "second" : null,
        }),
      );
    }
    if (url.includes(`/tables/${tableId}`))
      return new Response(
        JSON.stringify({
          ...table,
          gameVoteCounts: eventVoteCounts(
            table.games.map((g) => String(g.gameId)),
            rows.filter((r) => r.status === "ACCEPTED").map((r) => r.gameVotes),
          ),
        }),
      );
    return new Response(
      JSON.stringify({
        ...plannedEvent,
        groupType: table.groupType,
        myRegistrations: acceptedElsewhere ? [{ ...seat(m.actor), tableId: optionId }] : [],
        myVotes: acceptedElsewhere
          ? { dateVotes: { [optionId]: "YES" }, locationVotes: { [optionId]: "IF_NEEDED" } }
          : plannedEvent.myVotes,
        canVote:
          acceptedElsewhere || rows.some((r) => r.userId === m.actor && r.status === "ACCEPTED"),
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
function mount(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventTable eventId={eventId} tableId={tableId} />
    </QueryClientProvider>,
  );
  return client;
}
async function submitGameChoices() {
  fireEvent.click(await screen.findByRole("tab", { name: "Games" }));
  fireEvent.click(await screen.findByRole("button", { name: "Chess: Yes" }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Choose availability" })).getByRole("button", {
      name: "Join table",
    }),
  );
}
async function vote(label = "Chess", value = "Yes", current = "Choose your vote") {
  fireEvent.click(await screen.findByRole("button", { name: `${label}: ${current}` }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Choose your vote" })).getByRole("button", {
      name: value,
    }),
  );
}
it.each([403, 503])("keeps uncached table errors observable (%s) and retries", async (status) => {
  const original = fetcher.getMockImplementation();
  let broken = true;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    url.endsWith(`/tables/${tableId}`) && broken
      ? new Response("{}", { status })
      : original?.(url, init),
  );
  mount();
  await screen.findByText("Could not load table");
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "First table" })).not.toBeNull();
});
it.each([
  ["CONFIRMED", true],
  ["CONFIRMED", false],
  ["TERMINATED", true],
  ["TERMINATED", false],
] as const)(
  "owns top tabs for %s (rating enabled=%s) without querying current rankings until selected",
  async (eventStatus, rankingEnabled) => {
    table = {
      ...table,
      eventStatus,
      rankingEnabled,
      canLeave: false,
      confirmed: { gameId: 1, playerIds: ["owner"], startsAt: plannedEvent.createdAt },
    };
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation((url: string, init?: RequestInit) =>
      url.includes("/leaderboard?")
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                gameId: 1,
                scope: "GLOBAL",
                items: [
                  {
                    userId: "owner",
                    name: "Current owner",
                    avatarUrl: null,
                    score: 42,
                    provisional: false,
                    gamesPlayed: 5,
                    gamesWon: 2,
                    nd: 1,
                  },
                ],
                nextCursor: null,
              }),
            ),
          )
        : original(url, init),
    );
    mount();
    await screen.findByRole("tab", { name: "Overview" });
    expect(screen.getAllByRole("tab")).toHaveLength(eventStatus === "TERMINATED" ? 3 : 2);
    expect(screen.getByRole("tab", { name: "Ranking" })).not.toBeNull();
    expect(Boolean(screen.queryByRole("tab", { name: "Results" }))).toBe(
      eventStatus === "TERMINATED",
    );
    expect(fetcher.mock.calls.some(([url]) => url.includes("/leaderboard?"))).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "Ranking" }));
    expect(await screen.findByText("Current owner")).not.toBeNull();
    expect(screen.getByText("42.00")).not.toBeNull();
  },
);
it("keeps unavailable section selections safe when table metadata is replaced and shows excluded immutable results honestly", async () => {
  table = { ...table, eventStatus: "TERMINATED", canLeave: false, results: undefined };
  const client = mount();
  fireEvent.click(await screen.findByRole("tab", { name: "Results" }));
  expect(screen.getByRole("tabpanel", { name: "Results" }).textContent).toContain(
    "Excluded from confirmation",
  );
  await act(async () => {
    client.setQueryData(
      eventRecordKeys.table({ apiUrl: "https://api.test", userId: "owner" }, eventId, tableId),
      { ...table, eventStatus: "CONFIRMED" },
    );
  });
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe(
      "true",
    ),
  );
  expect(screen.queryByRole("tab", { name: "Results" })).toBeNull();
});
it("retries incomplete cached overview details without replacing usable identity", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    eventRecordKeys.table({ apiUrl: "https://api.test", userId: "owner" }, eventId, tableId),
    table,
    { updatedAt: 0 },
  );
  const original = fetcher.getMockImplementation()!;
  let broken = true;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    url.endsWith(`/tables/${tableId}`) && broken
      ? Promise.resolve(new Response("{}", { status: 503 }))
      : original(url, init),
  );
  mount(client);
  await screen.findByText("Could not load complete table details");
  expect(screen.getByRole("heading", { name: table.name })).not.toBeNull();
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.queryByText("Could not load complete table details")).toBeNull(),
  );
});
it("hides immutable deltas when Table ranking was disabled even if stale cache contains rating rows", async () => {
  table = {
    ...table,
    eventStatus: "TERMINATED",
    rankingEnabled: false,
    canLeave: false,
    results: {
      lowerWins: false,
      entries: [{ userId: "owner", score: "2", rank: 1 }],
      tieBreaks: [],
      finalizedAt: plannedEvent.createdAt,
    },
    ratingChanges: [{ userId: "owner", score: 99, delta: 1, provisional: true }],
    groupRatingChanges: [{ userId: "owner", score: 99, delta: 1, provisional: true }],
    resultProfiles: [{ userId: "owner", name: "Owner", email: null, avatarUrl: null }],
  };
  mount();
  fireEvent.click(await screen.findByRole("tab", { name: "Results" }));
  expect(await screen.findByText("Score")).not.toBeNull();
  expect(screen.getByText("2")).not.toBeNull();
  expect(screen.queryByText("99")).toBeNull();
  expect(screen.getByText("Global rating change").parentElement?.textContent).toBe(
    "Global rating change—",
  );
});
it("uses grouped games, name/settings help and an explicit ranking badge rather than repeating a table card", async () => {
  mount();
  await screen.findByRole("heading", { name: "First table" });
  expect(screen.queryByRole("link", { name: "Open table: First table" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Back to event" })).toBeNull();
  expect(screen.getByText("Chess").closest("li")?.parentElement?.tagName).toBe("UL");
  expect(screen.getByText("Minimum players: 2")).not.toBeNull();
  expect(screen.getByText("Maximum players: 4")).not.toBeNull();
  expect(screen.getByRole("img", { name: "Rating enabled" })).not.toBeNull();
  expect(screen.getByLabelText("Votes: Chess").closest("li")).toBe(
    screen.getByText("Chess").closest("li"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings: Field help" }));
  expect(await screen.findByText(/The minimum is required for agreement/)).not.toBeNull();
});
it("allows a negative game vote only while another current game remains positive", async () => {
  table = {
    ...table,
    games: [...table.games, { gameId: 2, durationMinutes: 60, durationSource: "MANUAL" }],
    gamesDetail: [...table.gamesDetail, { ...table.gamesDetail[0], id: 2, name: "Second game" }],
    myRegistration: { ...seat("owner"), gameVotes: { "1": "YES", "2": "IF_NEEDED" } },
  };
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Chess: Yes" }));
  const no = within(screen.getByRole("dialog", { name: "Choose your vote" })).getByRole("button", {
    name: "No",
  }) as HTMLButtonElement;
  expect(no.disabled).toBe(false);
  fireEvent.click(no);
  await screen.findByRole("button", { name: "Chess: No" });
  fireEvent.click(screen.getByRole("button", { name: "Second game: If needed" }));
  expect(
    (
      within(screen.getByRole("dialog", { name: "Choose your vote" })).getByRole("button", {
        name: "No",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Unknown" })).toBeNull();
});
it("starts with max places, lets organizer choose join/invite and shows one vote status after an actual join", async () => {
  rows = [];
  table = {
    ...table,
    myRegistration: null,
    myPosition: null,
    seatedCount: 0,
    canRegister: true,
    canLeave: false,
  };
  mount();
  const places = await screen.findAllByRole("button", { name: "Free place" });
  expect(places).toHaveLength(4);
  expect(screen.queryByRole("button", { name: "Join table" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Invite players" })).toBeNull();
  fireEvent.click(places[0]);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Join table" }));
  await submitGameChoices();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await vote("Chess", "If needed", "Yes");
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/votes") && JSON.parse(String(init?.body)).kind === "game",
      ),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Chess: If needed" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  expect(screen.queryByRole("button", { name: "Accepted" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Pending invitations" })).toBeNull();
});
it("waits for Event participation metadata, exposes failures and retries before opening Games with all tabs", async () => {
  rows = [];
  acceptedElsewhere = true;
  table = {
    ...table,
    groupType: "PRIVATE",
    canRegister: true,
    canInvite: false,
    myRegistration: null,
    myPosition: null,
  };
  const original = fetcher.getMockImplementation()!;
  const pending: Array<(response: Response) => void> = [];
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    url.endsWith(`/events/${eventId}`) && pending.length < 2
      ? new Promise<Response>((resolve) => pending.push(resolve))
      : original(url, init),
  );
  mount();
  const place = (
    await screen.findAllByRole("button", { name: "Free place" })
  )[0] as HTMLButtonElement;
  expect(place.disabled).toBe(true);
  fireEvent.click(place);
  expect(screen.queryByRole("dialog")).toBeNull();
  await act(async () => pending[0](new Response("{}", { status: 503 })));
  await screen.findByText("Could not load event");
  expect(place.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(pending).toHaveLength(2));
  await act(async () =>
    pending[1](
      new Response(
        JSON.stringify({
          ...plannedEvent,
          groupType: "PRIVATE",
          myRegistrations: [{ ...seat("owner"), tableId: optionId }],
          myVotes: { dateVotes: { [optionId]: "YES" }, locationVotes: { [optionId]: "IF_NEEDED" } },
        }),
      ),
    ),
  );
  await waitFor(() => expect(place.disabled).toBe(false));
  fireEvent.click(place);
  expect(screen.getByText("Choose your availability before joining this table.")).not.toBeNull();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Join table" }));
  expect(await screen.findByRole("tab", { name: "Games" })).not.toBeNull();
  expect(screen.getByRole("tab", { name: "Games" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tab", { name: "Dates" })).not.toBeNull();
  await submitGameChoices();
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/registrations") && init?.method === "POST",
      ),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Choose availability" })).toBeNull(),
  );
});
it("reuses PRIVATE dates/locations but requires this Table's games after another accepted registration", async () => {
  rows = [];
  acceptedElsewhere = true;
  table = {
    ...table,
    groupType: "PRIVATE",
    canRegister: true,
    canInvite: false,
    myRegistration: null,
    myPosition: null,
  };
  mount();
  fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Join table" }));
  expect(await screen.findByRole("tab", { name: "Games" })).not.toBeNull();
  expect(screen.getByRole("tab", { name: "Games" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tab", { name: "Locations" })).not.toBeNull();
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  await submitGameChoices();
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/registrations") && init?.method === "POST",
      ),
    ).toBe(true),
  );
  expect(
    JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body)),
  ).toHaveProperty("availability", {
    version: 1,
    dateVotes: { [optionId]: "YES" },
    locationVotes: { [optionId]: "IF_NEEDED" },
  });
});
it("shows the parent Event item with matching artwork and navigation below Table settings", async () => {
  mount();
  const link = await screen.findByRole("link", { name: `Open event: ${plannedEvent.name}` });
  expect(link.getAttribute("href")).toBe(`/events/${eventId}`);
  expect(link.querySelector(".dicebear-artwork")).not.toBeNull();
  expect(screen.getByRole("region", { name: "Event" }).contains(link)).toBe(true);
});
it.each([false, true])(
  "opens PRIVATE availability only after explicit join confirmation, organizer=%s",
  async (canInvite) => {
    rows = [];
    table = {
      ...table,
      groupType: "PRIVATE",
      canInvite,
      canRegister: true,
      myRegistration: null,
      myPosition: null,
      seatedCount: 0,
    };
    mount();
    fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
    expect(screen.queryByRole("heading", { name: "Choose availability" })).toBeNull();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Join table" }));
    await screen.findByRole("heading", { name: "Choose availability" });
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/registrations") && init?.method === "POST",
      ),
    ).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Choose availability" })).toBeNull(),
    );
  },
);
it("offers an invite-only modal when organizer already joined, routes to the existing picker and supports cancellation", async () => {
  mount();
  fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
  expect(
    within(screen.getByRole("dialog")).queryByRole("button", { name: "Join table" }),
  ).toBeNull();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Free place" })[0]);
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Invite players" }),
  );
  expect(m.push).toHaveBeenCalledWith(`/events/${eventId}/tables/${tableId}/invite`);
});
it("retains a queue entry beyond capacity and shows pending, accepted and waiting avatar badges without filter tabs", async () => {
  rows.push(
    { ...player("guest", tableId), position: "WAITING" },
    { ...player("invited", eventId), status: "PENDING" },
  );
  table = { ...table, maxPlayers: 2, seatedCount: 1, pendingCount: 1, waitingCount: 1 };
  mount();
  expect(await screen.findByText("guest")).not.toBeNull();
  expect(screen.getByRole("img", { name: "Waiting list" })).not.toBeNull();
  expect(screen.getByRole("img", { name: "Invitation pending" })).not.toBeNull();
  expect(screen.getByRole("img", { name: "Accepted player" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Join waiting list" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Seats list: Field help" }));
  expect(await screen.findByText(/Free places allow joining or invitations/)).not.toBeNull();
});
it("paginates source rosters and confirms other-player removal", async () => {
  rows.push({ ...player("guest", tableId), name: null, position: "WAITING" });
  paged = true;
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  const remove = await screen.findByRole("button", { name: "Remove player: guest" });
  expect(remove.closest("li")?.className).toContain("[content-visibility:auto]");
  fireEvent.click(remove);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove player: guest" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    fetcher.mock.calls.some(
      ([, init]) => init?.method === "PATCH" && JSON.parse(String(init.body)).action === "remove",
    ),
  ).toBe(true);
});
it("loads the next source page when the scroll sentinel intersects, without a manual refresh", async () => {
  rows.push(player("guest", tableId));
  paged = true;
  let enter: IntersectionObserverCallback | undefined;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        enter = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  mount();
  await screen.findByRole("button", { name: "Load more" });
  await waitFor(() => expect(enter).toBeTypeOf("function"));
  if (!enter) throw new Error("Missing observer callback");
  const notify = enter;
  await act(async () =>
    notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  expect(await screen.findByText("guest")).not.toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url.includes("cursor="))).toBe(true);
});
it("lets a new member join directly, never reads another user's pending stream, and preserves failed join feedback", async () => {
  m.actor = "guest";
  rows = [];
  table = {
    ...table,
    canInvite: false,
    canRegister: true,
    canLeave: false,
    myRegistration: null,
    myPosition: null,
    seatedCount: 0,
  };
  fail = true;
  mount();
  fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
  await submitGameChoices();
  await screen.findByText("Could not join table");
  expect(screen.getByRole("dialog", { name: "Choose availability" })).not.toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url.includes("pending=true"))).toBe(false);
  fail = false;
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Join table" }));
  await screen.findByText("guest");
});
it("preserves organizer join errors inside the game preference sheet", async () => {
  rows = [];
  table = { ...table, canRegister: true, myRegistration: null, myPosition: null, seatedCount: 0 };
  fail = true;
  mount();
  fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Join table" }));
  await submitGameChoices();
  expect(await screen.findByText("Could not join table")).not.toBeNull();
  expect(screen.getByRole("dialog", { name: "Choose availability" })).not.toBeNull();
});
it("confirms departure, retains failed destructive dialogs and never bypasses registration versions", async () => {
  fail = true;
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Leave table" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await screen.findByText("Could not update table registration");
  fail = false;
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    JSON.parse(String(fetcher.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)),
  ).toEqual({ action: "cancel", version: 1 });
});
it("keeps seat read failures visible, retries and renders empty places rather than empty-list success", async () => {
  const original = fetcher.getMockImplementation();
  let broken = true;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    url.includes("/seats?") && broken ? new Response("{}", { status: 503 }) : original?.(url, init),
  );
  mount();
  await screen.findByText("Could not load players");
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("owner");
});
it("shows confirmed email/timing and exclusion without voting or open-place actions", async () => {
  table = {
    ...table,
    eventStatus: "CONFIRMED",
    canRegister: false,
    canInvite: false,
    canLeave: false,
    startsAt: "2030-06-03T18:00:00Z",
    demonstratorUserId: "demo",
    demonstratorName: "Guide",
    confirmed: {
      gameId: 1,
      playerIds: ["owner"],
      startsAt: "2030-06-03T18:00:00Z",
      endsAt: "2030-06-03T19:00:00Z",
    },
  };
  mount();
  expect(await screen.findByText("owner@example.test")).not.toBeNull();
  expect(screen.getByText(/Guide/)).not.toBeNull();
  expect(screen.queryByRole("button", { name: /Chess:/ })).toBeNull();
});
it("does not present an excluded table as confirmed or show all candidate games as one frozen choice", async () => {
  table = {
    ...table,
    eventStatus: "CONFIRMED",
    confirmed: undefined,
    canInvite: false,
    canLeave: false,
    canRegister: false,
  };
  mount();
  expect(await screen.findByText("Excluded from confirmation")).not.toBeNull();
});
it("retains immutable exact scores, ND, profiles and both rating scopes, including missing profiles and retries", async () => {
  table = {
    ...table,
    eventStatus: "TERMINATED",
    canLeave: false,
    rankingEnabled: true,
    groupId: optionId,
    results: {
      lowerWins: false,
      entries: [
        { userId: "owner", score: "1.50", rank: 1 },
        { userId: "absent", score: null, rank: null },
        { userId: "guest", score: "1.5", rank: 1 },
      ],
      tieBreaks: [],
      finalizedAt: plannedEvent.createdAt,
    },
    ratingChanges: [
      { userId: "owner", score: 505, delta: 5, provisional: true },
      { userId: "guest", score: 500, delta: 0, provisional: true },
    ],
    groupRatingChanges: [
      { userId: "owner", score: 497, delta: -3, provisional: true },
      { userId: "guest", score: 507, delta: 7, provisional: true },
    ],
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    eventRecordKeys.table({ apiUrl: "https://api.test", userId: "owner" }, eventId, tableId),
    table,
    { updatedAt: 0 },
  );
  const original = fetcher.getMockImplementation();
  let broken = true;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    url.endsWith(`/tables/${tableId}`) && broken
      ? new Response("{}", { status: 503 })
      : original?.(url, init),
  );
  mount(client);
  await screen.findByText("Could not load complete table details");
  fireEvent.click(screen.getByRole("tab", { name: "Results" }));
  expect(screen.getAllByText("ND")).toHaveLength(2);
  expect(screen.getByText("1.50")).not.toBeNull();
  expect(
    screen
      .getAllByText("Global rating change")
      .some((label) => label.parentElement?.textContent === "Global rating change+0"),
  ).toBe(true);
  expect(
    screen
      .getAllByText("Group rating change")
      .some((label) => label.parentElement?.textContent === "Group rating change-3"),
  ).toBe(true);
  broken = false;
  table = {
    ...table,
    resultProfiles: [
      {
        userId: "owner",
        name: "Recovered owner",
        username: "owner",
        email: "owner@example.test",
        avatarUrl: null,
      },
    ],
  };
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("@owner")).not.toBeNull();
  expect(screen.getByText("Recovered owner")).not.toBeNull();
});
it.each([false, true])(
  "preserves unknown durations/demonstrators, with a missing confirmed game=%s",
  async (missing) => {
    table = {
      ...table,
      startsAt: "2030-06-03T18:00:00Z",
      demonstratorUserId: "demo",
      demonstratorName: undefined,
      games: [{ gameId: 1 }],
      ...(missing
        ? {
            eventStatus: "CONFIRMED" as const,
            confirmed: { gameId: 99, playerIds: ["owner"], startsAt: "2030-06-03T18:00:00Z" },
          }
        : {}),
    };
    mount();
    expect(await screen.findByText(/Duration: 0/)).not.toBeNull();
    expect(screen.getByText("Demonstrator: Unknown")).not.toBeNull();
  },
);
it.each(["accept", "decline"])(
  "retains own waiting invitation consent (%s) without reading another person's pending roster",
  async (action) => {
    m.actor = "guest";
    acceptedElsewhere = true;
    const invitation = {
      ...player("guest", tableId),
      status: "PENDING" as const,
      position: "WAITING" as const,
    };
    rows.push(invitation, { ...player("private-invite", eventId), status: "PENDING" });
    table = {
      ...table,
      canInvite: false,
      canLeave: false,
      canRespond: true,
      myRegistration: invitation,
      myPosition: "WAITING",
      seatedCount: 1,
      pendingCount: 1,
      waitingCount: 1,
    };
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: action === "accept" ? "Accept invitation" : "Decline invitation",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull(),
    );
    expect(fetcher.mock.calls.some(([url]) => url.includes("pending=true"))).toBe(false);
    expect(screen.queryByText("private-invite")).toBeNull();
  },
);
it("keeps cached players during a failed next page and permits explicit retry", async () => {
  rows.push(player("guest", tableId));
  paged = true;
  const original = fetcher.getMockImplementation();
  let broken = true;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    url.includes("cursor=") && broken ? new Response("{}", { status: 503 }) : original?.(url, init),
  );
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  await screen.findByText("Could not load players");
  expect(screen.getByText("owner")).not.toBeNull();
  broken = false;
  const retries = screen.getAllByRole("button", { name: "Try again" });
  fireEvent.click(retries[retries.length - 1]);
  expect(await screen.findByText("guest")).not.toBeNull();
});
it("rechecks capabilities and cutoff even while a place-action modal is open", async () => {
  table = { ...table, canRegister: true, myRegistration: null, myPosition: null, seatedCount: 0 };
  rows = [];
  const client = mount();
  fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
  const key = eventRecordKeys.table(
    { apiUrl: "https://api.test", userId: "owner" },
    eventId,
    tableId,
  );
  await act(async () => client.setQueryData(key, { ...table, canInvite: false }));
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", { name: "Invite players" }),
    ).toBeNull(),
  );
  await act(async () =>
    client.setQueryData(key, {
      ...table,
      groupType: "PUBLIC",
      bookingClosesAt: "2000-01-01T00:00:00Z",
    }),
  );
  await waitFor(() =>
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", { name: "Join table" }),
    ).toBeNull(),
  );
  expect(
    within(screen.getByRole("dialog")).queryByRole("button", { name: "Invite players" }),
  ).toBeNull();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
});
it("rechecks public cutoff and fixed game rules rather than showing stale actions", async () => {
  table = {
    ...table,
    groupType: "PUBLIC",
    bookingClosesAt: "2000-01-01T00:00:00Z",
    canRegister: true,
    canInvite: true,
    canLeave: true,
    canRespond: true,
    myRegistration: { ...player("owner"), status: "PENDING" },
  };
  mount();
  await screen.findByRole("heading", { name: "First table" });
  for (const name of ["Join table", "Leave table", "Accept invitation", "Decline invitation"])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: /Chess:/ })).toBeNull();
});
