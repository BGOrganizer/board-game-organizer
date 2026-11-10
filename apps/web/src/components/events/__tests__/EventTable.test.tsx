import {
  notificationItemId,
  type PlannedTableResponse,
  type TableSeatResponse,
} from "@board-game-organizer/schemas";
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

const m = vi.hoisted(() => ({
  actor: "owner",
  attention: "",
  push: vi.fn(),
  feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: m.push }),
  useSearchParams: () => new URLSearchParams(m.attention ? { attention: m.attention } : {}),
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: m.actor,
    getToken: async () => "fresh",
    feedback: m.feedback,
  }),
}));
let table: PlannedTableResponse,
  rows: TableSeatResponse[],
  fail = false,
  paged = false,
  acceptedElsewhere = false,
  fetcher: ReturnType<typeof vi.fn>;
it("retains selected Results across final-only access changes without exposing private rosters", async () => {
  table = { ...table, eventStatus: "CONFIRMED" };
  const client = mount();
  fireEvent.click(await screen.findByRole("tab", { name: "Results" }));
  await act(async () => {
    table = {
      ...table,
      eventStatus: "TERMINATED",
      sharedResultsOnly: true,
      readOnly: true,
      canManage: false,
      groupId: null,
      groupName: null,
      groupType: null,
      canRegister: false,
      canInvite: false,
      canLeave: false,
      canRespond: false,
      myRegistration: null,
    };
    client.setQueryData(
      eventRecordKeys.table({ apiUrl: "https://api.test", userId: "owner" }, eventId, tableId),
      table,
    );
  });
  await waitFor(() => expect(screen.queryByRole("tab", { name: "Ranking" })).toBeNull());
  expect(screen.getByRole("tab", { name: "Results" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByRole("tab", { name: /Participants/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Invite players" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Results" }));
  expect(screen.getByRole("tab", { name: "Results" }).getAttribute("aria-selected")).toBe("true");
  client.clear();
});

function player(user: string, id = optionId): TableSeatResponse {
  return { ...seat(user), id };
}
beforeEach(() => {
  vi.clearAllMocks();
  m.actor = "owner";
  m.attention = "";
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
    if (url.includes("/notifications/changes"))
      return Response.json({
        asOf: new Date().toISOString(),
        changes: [],
        nextCursor: null,
        tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
      });
    if (url.includes("/notifications/attention"))
      return Response.json({
        asOf: new Date().toISOString(),
        unreadCount: 0,
        summary: {
          tables: 0,
          events: 0,
          groups: 0,
          contacts: 0,
          sections: { connections: 0, requests: 0, search: 0 },
        },
        targets: (JSON.parse(new URL(url).searchParams.get("targets") ?? "[]") as unknown[]).map(
          (target) => ({
            target,
            count: 0,
            direct: 0,
            events: 0,
            sections: { connections: 0, requests: 0, search: 0 },
          }),
        ),
      });
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
        ...(input.action === "accept" ? { gameVotes: input.participation.gameVotes } : {}),
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
afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById("page-header-actions")?.remove();
});
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
it("separates Participants while retaining one roster reader and the same initial data requests across tab switches", async () => {
  const client = mount();
  await screen.findByRole("heading", { name: table.name });
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([url]) => url.includes("/seats?"))).toBe(true),
  );
  expect(screen.queryByRole("region", { name: "Seats list" })).toBeNull();
  const reads = () =>
    fetcher.mock.calls
      .filter(
        ([url, init]) =>
          !url.includes("/notifications/") && (!init?.method || init.method === "GET"),
      )
      .map(([url]) => url);
  const initial = reads();
  await openParticipants();
  expect(await screen.findByRole("region", { name: "Seats list" })).not.toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: /^Details/ }));
  await act(async () => {});
  expect(screen.queryByRole("region", { name: "Seats list" })).toBeNull();
  expect(reads()).toEqual(initial);
  expect(
    fetcher.mock.calls.some(([, init]) => init?.method === "POST" || init?.method === "PATCH"),
  ).toBe(false);
  client.clear();
});
it("opens a precise invitation attention link on Participants without accepting it", async () => {
  m.attention = notificationItemId(tableId, "invitation", undefined, "table");
  table = {
    ...table,
    myRegistration: { ...rows[0], status: "PENDING", kind: "INVITATION" },
    canRespond: true,
  };
  mount();
  expect(
    (await screen.findByRole("tab", { name: /^Participants/ })).getAttribute("aria-selected"),
  ).toBe("true");
  expect(await screen.findByRole("button", { name: "Accept invitation" })).not.toBeNull();
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
});
function multipleGames() {
  table = {
    ...table,
    games: [...table.games, { gameId: 2, durationMinutes: 60, durationSource: "MANUAL" }],
    gamesDetail: [...table.gamesDetail, { ...table.gamesDetail[0], id: 2, name: "Second game" }],
  };
}
async function submitGameChoices() {
  const dialog = await screen.findByRole("dialog", { name: "Review table settings" });
  const games = screen.queryByRole("tab", { name: "Games" });
  if (games) {
    fireEvent.click(games);
    fireEvent.click(await screen.findByRole("button", { name: "Chess: Yes" }));
    fireEvent.click(screen.getByRole("button", { name: "Second game: No" }));
  } else await within(dialog).findByText("Chess");
  const submit = within(dialog).getByRole("button", { name: "Join table" }) as HTMLButtonElement;
  await waitFor(() => expect(submit.disabled).toBe(false));
  fireEvent.click(submit);
}
async function openParticipants() {
  fireEvent.click(await screen.findByRole("tab", { name: /^Participants/ }));
}
async function vote(label = "Chess", value = "Yes", current = "Choose your vote") {
  fireEvent.click(await screen.findByRole("tab", { name: /^Details/ }));
  fireEvent.click(await screen.findByRole("button", { name: `${label}: ${current}` }));
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Choose your vote" })).getByRole("button", {
      name: value,
    }),
  );
}
it.each([
  "owner",
  "cached",
  "excluded",
  "guest",
  "planning",
  "terminated",
  "capability",
  "public-planning",
  "public-table",
  "public-parent",
])("offers result registration only on an included confirmed admin Table (%s)", async (kind) => {
  const header = document.createElement("header");
  header.id = "page-header-actions";
  document.body.append(header);
  const status =
    kind === "planning" || kind === "public-planning"
      ? "PLANNING"
      : kind === "terminated"
        ? "TERMINATED"
        : "CONFIRMED";
  table = {
    ...table,
    readOnly: kind === "public-planning" || kind === "public-table",
    eventStatus: status,
    confirmed:
      kind === "excluded"
        ? undefined
        : { gameId: 1, playerIds: ["owner", "guest"], startsAt: plannedEvent.createdAt },
  };
  if (kind === "guest") m.actor = "guest";
  const original = fetcher.getMockImplementation()!,
    parent = {
      ...plannedEvent,
      status,
      canFinalize: kind !== "capability",
      readOnly: kind === "public-parent",
    };
  let resolve: ((value: Response) => void) | undefined;
  fetcher.mockImplementation((url: string, init?: RequestInit) =>
    new URL(url).pathname === `/api/events/${eventId}` && (!init?.method || init.method === "GET")
      ? kind === "cached"
        ? new Promise<Response>((done) => {
            resolve = done;
          })
        : Response.json(parent)
      : original(url, init),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (kind === "cached")
    client.setQueryData(eventRecordKeys.list({ apiUrl: "https://api.test", userId: "owner" }), {
      pages: [{ items: [parent], nextCursor: null }],
      pageParams: [""],
    });
  mount(client);
  await screen.findByRole("heading", { name: "First table" });
  if (kind === "owner" || kind === "cached") {
    const link = await screen.findByRole("link", { name: "Register result" });
    expect(header.contains(link)).toBe(true);
    expect(link.getAttribute("href")).toBe(`/events/${eventId}/tables/${tableId}/results`);
    if (kind === "cached") {
      expect(link.getAttribute("aria-disabled")).toBe("true");
      expect(fireEvent.click(link)).toBe(false);
      await act(async () => {
        resolve!(Response.json(parent));
      });
      await waitFor(() => expect(link.getAttribute("aria-disabled")).toBe("false"));
    }
    document.addEventListener("click", (e) => e.preventDefault(), { once: true });
    fireEvent.click(link);
  } else expect(screen.queryByRole("link", { name: "Register result" })).toBeNull();
});
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
      ...(eventStatus === "TERMINATED"
        ? {
            results: {
              entries: [{ userId: "owner", score: "2", rank: 1 }],
              lowerWins: false,
              tieBreaks: [],
              finalizedAt: plannedEvent.createdAt,
            },
            resultProfiles: [
              { userId: "owner", name: "Current owner", email: null, avatarUrl: null },
            ],
          }
        : {}),
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
    await screen.findByRole("tab", { name: "Details" });
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.queryByRole("tab", { name: "Ranking" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Results" })).not.toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url.includes("/leaderboard?"))).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: "Results" }));
    expect(await screen.findByText("Current owner")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Global ranking: Current owner" }));
    expect(
      await screen.findByText(eventStatus === "CONFIRMED" ? "42" : "Ranking not updated"),
    ).not.toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url.includes("/leaderboard?"))).toBe(
      eventStatus === "CONFIRMED",
    );
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
    expect(screen.getByRole("tab", { name: "Results" }).getAttribute("aria-selected")).toBe("true"),
  );
  expect(screen.getByRole("tabpanel", { name: "Results" }).textContent).toContain(
    "Excluded from confirmation",
  );
});
it("returns to Details when Results becomes unavailable after reopening planning", async () => {
  table = { ...table, eventStatus: "CONFIRMED" };
  const client = mount();
  fireEvent.click(await screen.findByRole("tab", { name: "Results" }));
  await act(async () =>
    client.setQueryData(
      eventRecordKeys.table({ apiUrl: "https://api.test", userId: "owner" }, eventId, tableId),
      { ...table, eventStatus: "PLANNING" },
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("true"),
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
  expect(await screen.findByText("2")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Global ranking: Owner" }));
  expect(await screen.findByText("Ranking not updated")).toBeTruthy();
  expect(screen.queryByText("99")).toBeNull();
  expect(screen.queryByText("+1")).toBeNull();
});
it("uses grouped games, name/settings help and an explicit ranking badge rather than repeating a table card", async () => {
  multipleGames();
  mount();
  await screen.findByRole("heading", { name: "First table" });
  expect(screen.queryByRole("link", { name: "Open table: First table" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Back to event" })).toBeNull();
  expect(screen.getByText("Chess").closest("li")?.parentElement?.tagName).toBe("UL");
  expect(screen.getByRole("button", { name: "Rating enabled" })).not.toBeNull();
  expect(screen.getByLabelText("Votes: Chess").closest("li")).toBe(
    screen.getByText("Chess").closest("li"),
  );
  fireEvent.click(
    within(screen.getByRole("region", { name: "Settings" })).getByRole("button", {
      name: "Planning",
    }),
  );
  expect(screen.queryByText(/The minimum is required for agreement/)).toBeNull();
  expect(screen.getByText("Minimum players").parentElement?.textContent).toBe("Minimum players2");
  expect(screen.getByText("Maximum players").parentElement?.textContent).toBe("Maximum players4");
});
it("keeps a singleton game readable without voting buttons or totals for an accepted historical NO", async () => {
  rows = [{ ...rows[0], gameVotes: { "1": "NO" } }];
  table = { ...table, myRegistration: rows[0] };
  mount();
  await screen.findByText("Chess");
  expect(screen.queryByRole("button", { name: /^Chess:/ })).toBeNull();
  expect(screen.queryByLabelText("Votes: Chess")).toBeNull();
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
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
  multipleGames();
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
  await openParticipants();
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
it("waits for Event participation metadata, exposes failures and retries before opening only multiple-option tabs", async () => {
  multipleGames();
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
  await openParticipants();
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
  expect(
    screen.getByText(
      "Joining accepts the current event and table settings. Vote only where multiple options are available.",
    ),
  ).not.toBeNull();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Join table" }));
  expect(await screen.findByRole("tab", { name: "Games" })).not.toBeNull();
  expect(screen.getByRole("tab", { name: "Games" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByRole("tab", { name: "Dates" })).toBeNull();
  await submitGameChoices();
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/registrations") && init?.method === "POST",
      ),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Review table settings" })).toBeNull(),
  );
});
it("implicitly accepts fixed PRIVATE dates/locations but requires multiple Table game choices after another accepted registration", async () => {
  multipleGames();
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
  await openParticipants();
  fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Join table" }));
  expect(await screen.findByRole("tab", { name: "Games" })).not.toBeNull();
  expect(screen.getByRole("tab", { name: "Games" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByRole("tab", { name: "Locations" })).toBeNull();
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
    dateVotes: {},
    locationVotes: {},
  });
});
it("shows the parent Event item with matching artwork and navigation below Table settings", async () => {
  mount();
  const link = await screen.findByRole("link", { name: `Open event: ${plannedEvent.name}` });
  expect(link.getAttribute("href")).toBe(`/events/${eventId}`);
  expect(link.closest(".card")?.querySelector(".dicebear-artwork")).not.toBeNull();
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
    await openParticipants();
    fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
    expect(screen.queryByRole("heading", { name: "Review table settings" })).toBeNull();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Join table" }));
    await screen.findByRole("heading", { name: "Review table settings" });
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/registrations") && init?.method === "POST",
      ),
    ).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Review table settings" })).toBeNull(),
    );
  },
);
it("offers an invite-only modal when organizer already joined, routes to the existing picker and supports cancellation", async () => {
  mount();
  await openParticipants();
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
it("always shows an empty, non-interactive waiting list after seats while places remain free", async () => {
  mount();
  await openParticipants();
  const empty = await screen.findByText("No players waiting"),
    waiting = screen.getByRole("region", { name: "Waiting list" }),
    seats = screen.getByRole("region", { name: "Seats list" });
  expect(seats.nextElementSibling).toBe(waiting);
  expect(waiting.contains(empty)).toBe(true);
  expect(empty.parentElement?.className).toContain("items-center");
  expect(empty.parentElement?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  expect(within(waiting).queryByRole("list")).toBeNull();
  expect(within(waiting).getAllByRole("button")).toHaveLength(1);
  expect(within(waiting).getByRole("button", { name: "Waiting list: Field help" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Join waiting list" })).toBeNull();
  expect(within(seats).getAllByRole("button", { name: "Free place" }).length).toBeGreaterThan(0);
});
it("shows an empty waiting list for a completely loaded full frozen roster without a queue action", async () => {
  rows = [player("owner"), player("guest", tableId)].map((row) => ({ ...row, position: "FROZEN" }));
  table = {
    ...table,
    eventStatus: "CONFIRMED",
    maxPlayers: 2,
    seatedCount: 2,
    canRegister: false,
    canInvite: false,
    canLeave: false,
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  };
  mount();
  await openParticipants();
  await screen.findByText("No players waiting");
  expect(screen.queryByRole("button", { name: "Join waiting list" })).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Waiting list" })).queryByRole("list"),
  ).toBeNull();
});
it("does not report an empty queue while a full roster still has another source page", async () => {
  paged = true;
  rows.push({ ...player("guest", tableId), position: "WAITING" });
  table = { ...table, maxPlayers: 2, seatedCount: 2, waitingCount: 1 };
  mount();
  await openParticipants();
  await screen.findByRole("button", { name: "Load more" });
  expect(screen.getByRole("heading", { name: "Waiting list" })).not.toBeNull();
  expect(screen.queryByText("No players waiting")).toBeNull();
});
it("retains a queue entry beyond capacity and shows pending, accepted and waiting avatar badges without filter tabs", async () => {
  rows.push(
    { ...player("guest", tableId), position: "WAITING" },
    { ...player("invited", eventId), status: "PENDING" },
  );
  table = { ...table, maxPlayers: 2, seatedCount: 1, pendingCount: 1, waitingCount: 1 };
  mount();
  await openParticipants();
  expect(await screen.findByText("@guest")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Player on the waiting list" })).not.toBeNull();
  expect(screen.getByRole("button", { name: "Player with pending invitation" })).not.toBeNull();
  expect(screen.getAllByRole("button", { name: "Confirmed player" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Join waiting list" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Seats list: Field help" }));
  expect(await screen.findByText(/Free places allow joining or invitations/)).not.toBeNull();
});
it("retains historical SELF requests and does not invent a seat for an accepted unknown position", async () => {
  rows.push(
    { ...player("legacy", tableId), kind: "SELF", status: "PENDING" },
    player("unplaced", eventId),
  );
  for (const row of rows.slice(-2)) Reflect.deleteProperty(row, "position");
  mount();
  await openParticipants();
  expect(await screen.findByText("@legacy")).toBeTruthy();
  expect(screen.getByText("Participation requested")).toBeTruthy();
  expect(screen.getByText("@unplaced")).toBeTruthy();
  expect(screen.getByText("Loading…")).toBeTruthy();
});
it("paginates source rosters and confirms other-player removal", async () => {
  rows.push({ ...player("guest", tableId), name: null, position: "WAITING" });
  paged = true;
  mount();
  await openParticipants();
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  const remove = await screen.findByRole("button", { name: "Remove player: @guest" });
  expect(remove.closest("li")?.className).toContain("[content-visibility:auto]");
  fireEvent.click(remove);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove player: @guest" }));
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
  await openParticipants();
  await screen.findByRole("button", { name: "Load more" });
  await waitFor(() => expect(enter).toBeTypeOf("function"));
  if (!enter) throw new Error("Missing observer callback");
  const notify = enter;
  await act(async () =>
    notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
  expect(await screen.findByText("@guest")).not.toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url.includes("cursor="))).toBe(true);
});
it("lets a new member join directly, never reads another user's pending stream, and preserves failed join feedback", async () => {
  multipleGames();
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
  await openParticipants();
  fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
  await submitGameChoices();
  expect(screen.queryByRole("dialog", { name: "Review table settings" })).toBeNull();
  await waitFor(() =>
    expect(m.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "join_table"),
  );
  expect(fetcher.mock.calls.some(([url]) => url.includes("pending=true"))).toBe(false);
  const free = (
    await screen.findAllByRole("button", { name: "Free place" })
  )[0] as HTMLButtonElement;
  await waitFor(() => expect(free.disabled).toBe(false));
  fireEvent.click(free);
  await screen.findByText("Could not join table");
  fireEvent.click(screen.getByRole("tab", { name: "Games" }));
  expect(
    (await screen.findByRole("button", { name: "Chess: Yes" })).getAttribute("aria-pressed"),
  ).toBe("true");
  fail = false;
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Join table" }));
  expect(screen.queryByRole("dialog", { name: "Review table settings" })).toBeNull();
  await screen.findByText("You");
  expect(screen.queryByText("guest")).toBeNull();
});
it("reports organizer rejection after immediate close and recovers preferences on explicit reopening", async () => {
  rows = [];
  table = { ...table, canRegister: true, myRegistration: null, myPosition: null, seatedCount: 0 };
  fail = true;
  mount();
  await openParticipants();
  fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Join table" }));
  await submitGameChoices();
  expect(screen.queryByRole("dialog", { name: "Review table settings" })).toBeNull();
  await waitFor(() =>
    expect(m.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "join_table"),
  );
  fireEvent.click((await screen.findAllByRole("button", { name: "Free place" }))[0]);
  fireEvent.click(
    await within(screen.getByRole("dialog")).findByRole("button", { name: "Join table" }),
  );
  expect(await screen.findByText("Could not join table")).not.toBeNull();
  expect(screen.getByRole("dialog", { name: "Review table settings" })).not.toBeNull();
});
it("closes departure immediately, restores a rejected participant for explicit retry and keeps registration versions", async () => {
  fail = true;
  mount();
  await openParticipants();
  fireEvent.click(await screen.findByRole("button", { name: "Leave table" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() =>
    expect(m.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "leave_table"),
  );
  fail = false;
  fireEvent.click(await screen.findByRole("button", { name: "Leave table" }));
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
  await openParticipants();
  await screen.findByText("Could not load players");
  expect(screen.queryByText("No players waiting")).toBeNull();
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("@owner");
  expect(screen.queryByText("owner")).toBeNull();
});
it("shows confirmed username/timing and exclusion without email, voting or open-place actions", async () => {
  table = {
    ...table,
    groupType: "PUBLIC",
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
  await openParticipants();
  expect(await screen.findByText("@owner")).not.toBeNull();
  expect(screen.queryByText("owner@example.test")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: /^Details/ }));
  expect(screen.getByText(/Guide/)).not.toBeNull();
  expect(
    screen
      .getByRole("region", { name: "Settings" })
      .compareDocumentPosition(screen.getByRole("region", { name: "Table schedule" })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
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
  fireEvent.click(await screen.findByRole("button", { name: "Confirmed" }));
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
  fireEvent.click(
    screen.getAllByRole("button", { name: "Global ranking: Username unavailable" })[0],
  );
  expect(await screen.findByRole("heading", { name: /^Global ranking/ })).toBeTruthy();
  expect(screen.getByText("+5")).toBeTruthy();
  expect(screen.queryByText("-3")).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(
    screen.getAllByRole("button", { name: "Group ranking: Username unavailable" })[0],
  );
  expect(await screen.findByRole("heading", { name: /^Group ranking/ })).toBeTruthy();
  expect(screen.getByText("-3")).toBeTruthy();
  expect(screen.queryByText("+5")).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(
    screen.getAllByRole("button", { name: "Global ranking: Username unavailable" })[1],
  );
  expect(await screen.findByText("0")).toBeTruthy();
  expect(screen.queryByText("+7")).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(
    screen.getAllByRole("button", { name: "Group ranking: Username unavailable" })[1],
  );
  expect(await screen.findByText("+7")).toBeTruthy();
  expect(screen.queryByText("0")).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
  expect(screen.queryByText("Recovered owner")).toBeNull();
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
    await screen.findByRole("heading", { name: table.name, level: 1 });
    if (missing) {
      expect(await screen.findByRole("region", { name: "Table schedule" })).toBeTruthy();
      expect(screen.queryByText(/^Duration:/)).toBeNull();
    } else expect(screen.queryByRole("region", { name: "Table schedule" })).toBeNull();
    expect(screen.queryByText("Demonstrator")).toBeNull();
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
    await openParticipants();
    fireEvent.click(
      await screen.findByRole("button", {
        name: action === "accept" ? "Accept invitation" : "Decline invitation",
      }),
    );
    if (action === "accept") {
      const dialog = await screen.findByRole("dialog");
      expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
      await within(dialog).findByText("Chess");
      expect(within(dialog).queryByRole("button", { name: "Chess: Yes" })).toBeNull();
      const accept = within(dialog).getByRole("button", {
        name: "Accept invitation",
      }) as HTMLButtonElement;
      await waitFor(() => expect(accept.disabled).toBe(false));
      fireEvent.click(accept);
    }
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
  await openParticipants();
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  await screen.findByText("Could not load players");
  expect(screen.getByText("@owner")).not.toBeNull();
  expect(screen.queryByText("owner")).toBeNull();
  broken = false;
  const retries = screen.getAllByRole("button", { name: "Try again" });
  fireEvent.click(retries[retries.length - 1]);
  expect(await screen.findByText("@guest")).not.toBeNull();
});
it("rechecks capabilities and cutoff even while a place-action modal is open", async () => {
  table = { ...table, canRegister: true, myRegistration: null, myPosition: null, seatedCount: 0 };
  rows = [];
  const client = mount();
  await openParticipants();
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
    within(screen.getByRole("dialog")).getByRole("button", { name: "Invite players" }),
  ).toBeTruthy();
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
