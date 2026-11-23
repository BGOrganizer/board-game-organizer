import type {
  PlannedTableResponse,
  TableLeaderboardPlayer,
  TableLeaderboardResponse,
} from "@board-game-organizer/schemas";
import { tableLeaderboardQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListActivityContext } from "@/lib/listActivity";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventPlayerRatingPopover } from "../EventPlayerRatingPopover";
import { EventTableResults } from "../EventTableResults";

const API = "https://table-result-fixtures.test";
const boundary = vi.hoisted(() => ({
  apiUrl: "https://table-result-fixtures.test",
  userId: "owner",
  enabled: true,
  getToken: vi.fn(),
}));
const options = () => ({
  apiUrl: boundary.apiUrl,
  userId: boundary.userId,
  enabled: boundary.enabled,
  getToken: boundary.getToken,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));
vi.mock("expo-router", () => ({ useNavigation: () => ({ getState: () => ({ type: "stack" }) }) }));
let client: QueryClient;
let record: PlannedTableResponse;
let response: TableLeaderboardResponse;
let nextResponse: TableLeaderboardResponse;
let status: number;
let nextStatus: number;
let pending: Promise<Response> | undefined;
let pendingNext: Promise<Response> | undefined;
const reads: { url: URL; authorization: string | null }[] = [];
const json = (value: unknown, code = 200) =>
  new Response(JSON.stringify(value), {
    status: code,
    headers: { "content-type": "application/json" },
  });
function player(
  userId = "owner",
  change: Partial<TableLeaderboardPlayer> = {},
): TableLeaderboardPlayer {
  return {
    userId,
    name: `${userId} Player`,
    username: `@${userId}`,
    avatarUrl: null,
    score: 1250.5,
    provisional: false,
    gamesPlayed: 8,
    gamesWon: 3,
    nd: 1,
    ...change,
  };
}
function confirmed(change: Partial<PlannedTableResponse> = {}): PlannedTableResponse {
  return {
    ...plannedTable,
    eventStatus: "CONFIRMED",
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
    ...change,
  };
}
function history(change: Partial<PlannedTableResponse> = {}): PlannedTableResponse {
  return confirmed({
    eventStatus: "TERMINATED",
    results: {
      lowerWins: false,
      entries: [
        { userId: "owner", score: "12.5", rank: 1 },
        { userId: "guest", score: "10", rank: 2 },
      ],
      tieBreaks: [],
      finalizedAt: "2030-06-04T12:00:00Z",
    },
    resultProfiles: [
      { userId: "owner", name: "Owner Player", username: "@owner", email: null, avatarUrl: null },
      { userId: "guest", name: "Guest Player", username: "guest", email: null, avatarUrl: null },
    ],
    ...change,
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  boundary.apiUrl = API;
  boundary.userId = "owner";
  boundary.enabled = true;
  boundary.getToken.mockResolvedValue("fixture-table-token");
  record = confirmed();
  response = { gameId: 1, scope: "GLOBAL", items: [player()], nextCursor: null };
  nextResponse = { ...response, items: [player("guest")] };
  status = nextStatus = 200;
  pending = pendingNext = undefined;
  reads.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  await installNativePopoverMeasurements();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin !== boundary.apiUrl ||
        url.pathname !== `/api/events/${record.eventId}/tables/${record.id}/leaderboard` ||
        (init?.method ?? "GET") !== "GET"
      )
        throw new Error(`Unexpected table result request: ${url.origin}${url.pathname}`);
      reads.push({ url, authorization: new Headers(init?.headers).get("authorization") });
      const more = url.searchParams.has("cursor");
      const code = more ? nextStatus : status;
      return (
        (more ? pendingNext : pending) ??
        json(
          code === 200
            ? more
              ? nextResponse
              : response
            : { error: "Fixture rankings unavailable" },
          code,
        )
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  table = record,
  header = <Text>Results header</Text>,
  active = true,
}: ComponentProps<typeof EventTableResults> & { active?: boolean }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <ListActivityContext value={{ current: active }}>
          <EventTableResults table={table} header={header} />
        </ListActivityContext>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
function scrollHost() {
  let node = screen.getByText("Results header");
  while (node.parent && typeof node.props.onScroll !== "function") node = node.parent;
  if (typeof node.props.onScroll !== "function")
    throw new Error("Expected the actual results native scroll host");
  return node;
}
async function end(height = 1200) {
  await scrollNativeListToEnd(scrollHost(), height);
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}

it("renders current confirmed roster ratings from authenticated scope and leaves rank/results absent", async () => {
  await render(<Fixture table={record} />);
  expect(await screen.findByText("@owner")).toBeVisible();
  expect(screen.getByText("Results header")).toBeVisible();
  expect(screen.queryByLabelText(/Position:/)).toBeNull();
  expect(screen.queryByLabelText(/Score:/)).toBeNull();
  expect(reads[0].authorization).toBe("Bearer fixture-table-token");
  await pressMeasuredPopover(screen.getByRole("button", { name: "Global ranking: @owner" }));
  expect(screen.getByText("1,250.5")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Global ranking · Chess" })).toBeVisible();
});

it.each(["PLANNING", "CONFIRMED"] as const)(
  "keeps an unconfirmed %s table explicitly excluded, preserving its header",
  async (eventStatus) => {
    record = { ...plannedTable, eventStatus };
    await render(<Fixture table={record} />);
    expect(screen.getByText("Excluded from confirmation")).toBeVisible();
    expect(screen.getByText("Results header")).toBeVisible();
    expect(reads).toHaveLength(0);
  },
);

it("renders immutable completed standings from their frozen profiles without calling the current leaderboard", async () => {
  record = history();
  await render(<Fixture table={record} />);
  const header = screen.getByText("Results header").parent;
  if (!header) throw new Error("Expected the table results header");
  expect(header).toHaveStyle({ gap: 16 });
  expect(within(header).getByRole("heading", { name: "Chess" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "How OpenSkill works" })).toBeNull();
  expect(screen.getByText("@owner")).toBeVisible();
  expect(screen.getByText("@guest")).toBeVisible();
  expect(screen.getByLabelText("Score: 12.5")).toBeVisible();
  expect(screen.getByLabelText("Score: 10")).toBeVisible();
  expect(screen.getByRole("image", { name: "Position: #1" })).toBeVisible();
  expect(screen.getByRole("image", { name: "Position: #2" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "@owner, Position: #1, Score: 12.5", expanded: false }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Position: #1" })).toBeNull();
  expect(screen.queryByText("Global")).toBeNull();
  expect(reads).toHaveLength(0);
});

it("keeps tied winners, ranked players and ND results distinct without duplicating position text", async () => {
  record = history({
    confirmed: {
      ...confirmed().confirmed,
      gameId: 1,
      playerIds: ["owner", "guest", "unranked"],
      startsAt: "2030-06-03T18:00:00Z",
    },
    results: {
      lowerWins: false,
      entries: [
        { userId: "owner", score: "20", rank: 1 },
        { userId: "guest", score: "20", rank: 1 },
        { userId: "unranked", score: null, rank: null },
      ],
      tieBreaks: [],
      finalizedAt: "2030-06-04T12:00:00Z",
    },
  });
  await render(<Fixture table={record} />);
  expect(screen.getAllByRole("image", { name: "Position: #1" })).toHaveLength(2);
  expect(screen.getByRole("image", { name: "Position: ND" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Username unavailable, Position: ND, Score: ND" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Score: ND")).toBeVisible();
  expect(screen.getByText("Username unavailable")).toBeVisible();
  expect(screen.queryByText("Position: #1")).toBeNull();
});

it("expands and collapses immutable group and global rating transitions inline", async () => {
  record = history({
    groupId: "33333333-3333-4333-8333-333333333333",
    ratingChanges: [
      { userId: "owner", score: 1225, delta: 25, provisional: true },
      { userId: "guest", score: 999, delta: 0, provisional: false },
    ],
    groupRatingChanges: [{ userId: "owner", score: 790, delta: -10, provisional: false }],
  });
  await render(<Fixture table={record} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: /@owner, Position/, expanded: false });
  expect(screen.queryByText("Group")).toBeNull();
  expect(screen.queryByText("Global")).toBeNull();
  await user.press(trigger);
  expect(screen.getByRole("button", { name: /@owner, Position/, expanded: true })).toBeVisible();
  expect(screen.getByText("Group")).toBeVisible();
  expect(screen.getByText("Global")).toBeVisible();
  expect(screen.getAllByText("→")).toHaveLength(2);
  for (const label of [
    "Rating before: 800",
    "Rating after: 790",
    "Rating change: -10",
    "Rating before: 1,200",
    "Rating after: 1,225",
    "Rating change: +25",
    "Provisional rating",
  ]) {
    expect(screen.getByLabelText(label)).toBeVisible();
  }
  expect(screen.queryByText("999")).toBeNull();
  await user.press(trigger);
  expect(screen.getByRole("button", { name: /@owner, Position/, expanded: false })).toBeVisible();
  expect(screen.queryByText("Global")).toBeNull();
  await user.press(screen.getByRole("button", { name: /@guest, Position/ }));
  expect(screen.getByLabelText("Rating change: 0")).toBeVisible();
  expect(reads).toHaveLength(0);
});

it("never exposes group ratings in shared results and gives guests a plain score row", async () => {
  record = history({
    sharedResultsOnly: true,
    groupId: "33333333-3333-4333-8333-333333333333",
    ratingChanges: [{ userId: "owner", score: 1225, delta: 25, provisional: false }],
    groupRatingChanges: [{ userId: "owner", score: 790, delta: -10, provisional: false }],
    resultProfiles: [
      { userId: "owner", name: "Owner Player", username: "owner", email: null, avatarUrl: null },
      {
        userId: "guest",
        name: "Guest Player",
        guestName: "Guest Player",
        username: null,
        email: null,
        avatarUrl: null,
      },
    ],
  });
  await render(<Fixture table={record} />);
  expect(screen.getByText("Guest Player")).toBeVisible();
  expect(screen.getByLabelText("Score: 10")).toBeVisible();
  expect(screen.getByText("Guest")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Guest Player/ })).toBeNull();
  await press("@owner, Position: #1, Score: 12.5");
  expect(screen.getByText("Global")).toBeVisible();
  expect(screen.queryByText("Group")).toBeNull();
  expect(screen.getByLabelText("Rating after: 1,225")).toBeVisible();
  expect(screen.queryByText("790")).toBeNull();
  expect(reads).toHaveLength(0);
});

it.each([
  { rankingEnabled: false, expected: "Ranking not updated" },
  { rankingEnabled: true, expected: "Historical ranking unavailable" },
] as const)(
  "presents missing inline ratings as $expected",
  async ({ rankingEnabled, expected }) => {
    await render(<Fixture table={history({ rankingEnabled })} />);
    await press("@owner, Position: #1, Score: 12.5");
    expect(screen.getByText(expected)).toBeVisible();
    expect(screen.queryByText("→")).toBeNull();
  },
);

it("keeps finalized results readable when a historical included table lacks a modern confirmed projection", async () => {
  record = history({ confirmed: undefined });
  await render(<Fixture table={record} />);
  expect(screen.getByText("@owner")).toBeVisible();
  expect(screen.queryByText("Chess")).toBeNull();
  expect(screen.queryByText("Excluded from confirmation")).toBeNull();
  expect(reads).toHaveLength(0);
});

it("shows a genuine empty finished result set without requesting or fabricating player identities", async () => {
  record = history({ results: undefined, resultProfiles: [] });
  await render(<Fixture table={record} />);
  expect(screen.getByText("No players found")).toBeVisible();
  expect(reads).toHaveLength(0);
});

it("keeps initial loading distinct from an empty current leaderboard", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture table={record} />);
  expect(screen.queryByText("No players found")).toBeNull();
  expect(screen.queryByText("@owner")).toBeNull();
  await act(() => finish(json({ ...response, items: [] })));
  expect(await screen.findByText("No players found")).toBeVisible();
});

it("preserves a failed current leaderboard as an explicit retryable error", async () => {
  status = 503;
  await render(<Fixture table={record} />);
  expect(await screen.findByText("Could not load leaderboards. Retry")).toBeVisible();
  expect(screen.queryByText("No players found")).toBeNull();
  status = 200;
  await press("Try again");
  expect(await screen.findByText("@owner")).toBeVisible();
});

it("revokes cached private player rows when a real background read denies access", async () => {
  const query = tableLeaderboardQuery(
    options(),
    record.eventId,
    record.id,
    1,
    record.confirmed?.playerIds,
  );
  client.setQueryData(query.queryKey, { pages: [response], pageParams: [""] });
  status = 403;
  await render(<Fixture table={record} />);
  expect(await screen.findByText("Could not load leaderboards. Retry")).toBeVisible();
  expect(screen.queryByText("@owner")).toBeNull();
});

it("keeps an old game/roster response unusable instead of rendering unauthorized returned players", async () => {
  response = { ...response, gameId: 99, items: [player("not-in-roster")] };
  await render(<Fixture table={record} />);
  expect(await screen.findByText("Could not load leaderboards. Retry")).toBeVisible();
  expect(screen.queryByText("@not-in-roster")).toBeNull();
});

it("reveals retained pages after a real native scroll, preserving canonical query pages and owner fences", async () => {
  response = { ...response, nextCursor: "next-players" };
  const query = tableLeaderboardQuery(
    options(),
    record.eventId,
    record.id,
    1,
    record.confirmed?.playerIds,
  );
  const cached = { pages: [response, nextResponse], pageParams: ["", "next-players"] };
  client.setQueryData(query.queryKey, cached);
  await render(<Fixture table={record} />);
  expect(await screen.findByText("@owner")).toBeVisible();
  await waitFor(() => expect(client.getQueryState(query.queryKey)?.fetchStatus).toBe("idle"));
  expect(screen.queryByText("@guest")).toBeNull();
  const initialReads = reads.length;
  await end();
  expect(await screen.findByText("@guest")).toBeVisible();
  expect(client.getQueryData(query.queryKey)).toBe(cached);
  expect(reads).toHaveLength(initialReads);
});

it("rejects inactive paging and coalesces duplicate end events while the actual next request is pending", async () => {
  response = { ...response, nextCursor: "next-players" };
  const view = await render(<Fixture table={record} active={false} />);
  await screen.findByText("@owner");
  await end();
  expect(reads.filter(({ url }) => url.searchParams.has("cursor"))).toHaveLength(0);
  await view.rerender(<Fixture table={record} active />);
  let finish: (value: Response) => void = () => {};
  pendingNext = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await end(1264);
  await waitFor(() =>
    expect(reads.filter(({ url }) => url.searchParams.has("cursor"))).toHaveLength(1),
  );
  await end(1328);
  expect(reads.filter(({ url }) => url.searchParams.has("cursor"))).toHaveLength(1);
  pendingNext = undefined;
  await act(() => finish(json(nextResponse)));
  expect(await screen.findByText("@guest")).toBeVisible();
});

it("does not reuse the previous actor's cached rows or scroll intent after account/API changes", async () => {
  const view = await render(<Fixture table={record} />);
  await screen.findByText("@owner");
  const originalHost = scrollHost();
  boundary.userId = "second-account";
  boundary.apiUrl = "https://second-result-fixtures.test";
  response = { ...response, items: [player("guest")] };
  await view.rerender(<Fixture table={record} />);
  expect(scrollHost()).not.toBe(originalHost);
  expect(screen.queryByText("@owner")).toBeNull();
  expect(await screen.findByText("@guest")).toBeVisible();
  expect(reads.at(-1)?.url.origin).toBe(boundary.apiUrl);
});

it("updates current canonical ratings in place while retained completed results remain immutable", async () => {
  const view = await render(<Fixture table={record} />);
  await screen.findByText("@owner");
  const query = tableLeaderboardQuery(
    options(),
    record.eventId,
    record.id,
    1,
    record.confirmed?.playerIds,
  );
  await act(() =>
    client.setQueryData(query.queryKey, {
      pages: [{ ...response, items: [player("owner", { score: 1400 })] }],
      pageParams: [""],
    }),
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Global ranking: @owner" }));
  expect(screen.getByText("1,400")).toBeVisible();
  await view.rerender(<Fixture table={history()} />);
  expect(screen.getByLabelText("Score: 12.5")).toBeTruthy();
  expect(screen.queryByText("1,400")).toBeNull();
});

it.each([
  { scope: "Global ranking", before: "1,200", after: "1,225", change: "+25" },
  { scope: "Group ranking", before: "800", after: "790", change: "-10" },
] as const)(
  "shows immutable $scope before/after/delta rather than replacing history with a current rating",
  async ({ scope, before, after, change }) => {
    const table = history({
      groupId: "33333333-3333-4333-8333-333333333333",
      ratingChanges: [{ userId: "owner", score: 1225, delta: 25, provisional: true }],
      groupRatingChanges: [{ userId: "owner", score: 790, delta: -10, provisional: false }],
    });
    await render(
      <NativeTestProviders>
        <EventPlayerRatingPopover
          table={table}
          userId="owner"
          name="@owner"
          current={player("owner", { score: 9999 })}
        />
      </NativeTestProviders>,
    );
    await pressMeasuredPopover(screen.getByRole("button", { name: `${scope}: @owner` }));
    for (const text of ["Rating before", before, "Rating after", after, "Rating change", change])
      expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByText("9,999")).toBeNull();
  },
);

it.each([
  { rankingEnabled: false, expected: "Ranking not updated" },
  { rankingEnabled: true, expected: "Historical ranking unavailable" },
] as const)(
  "keeps unavailable historical ratings explicit ($expected)",
  async ({ rankingEnabled, expected }) => {
    await render(
      <NativeTestProviders>
        <EventPlayerRatingPopover
          table={history({ rankingEnabled })}
          userId="owner"
          name="@owner"
        />
      </NativeTestProviders>,
    );
    await pressMeasuredPopover(screen.getByRole("button", { name: "Global ranking: @owner" }));
    expect(screen.getByText(expected)).toBeVisible();
  },
);

it("keeps missing current scope ratings unavailable and exposes available group/global ratings separately", async () => {
  const table = confirmed({ groupId: "33333333-3333-4333-8333-333333333333" });
  const view = await render(
    <NativeTestProviders>
      <EventPlayerRatingPopover table={table} userId="owner" name="@owner" />
    </NativeTestProviders>,
  );
  await pressMeasuredPopover(screen.getByRole("button", { name: "Group ranking: @owner" }));
  expect(screen.getByText("Ranking unavailable")).toBeVisible();
  await view.rerender(
    <NativeTestProviders>
      <EventPlayerRatingPopover
        table={table}
        userId="owner"
        name="@owner"
        current={{
          ...player(),
          globalRating: { score: 1500, provisional: true },
          groupRating: { score: 900, provisional: false },
        }}
      />
    </NativeTestProviders>,
  );
  expect(screen.getByText("900")).toBeVisible();
  expect(screen.queryByText("1,500")).toBeNull();
});
