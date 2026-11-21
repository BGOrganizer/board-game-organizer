import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Dimensions, StyleSheet, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { Leaderboard } from "@/components/ratings/Leaderboard";
import { ListActivityContext } from "@/lib/listActivity";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { positionMeasuredSelect } from "@/test/nativeSelectGeometry";

const API = "https://leaderboard-fixtures.test";
const boundary = vi.hoisted(() => ({
  apiUrl: "https://leaderboard-fixtures.test",
  userId: "owner",
  getToken: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: boundary.userId,
    sessionId: `session-${boundary.userId}`,
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return { extra: { apiUrl: boundary.apiUrl } };
    },
  },
}));
type Player = GroupLeaderboardResponse["players"][number];
const player = (userId: string, change: Partial<Player> = {}): Player => ({
  userId,
  name: `Player ${userId}`,
  username: userId,
  avatarUrl: null,
  gamesPlayed: 6,
  gamesWon: 2,
  nd: 1,
  rating: 25.5,
  provisional: false,
  left: false,
  groupRole: "MEMBER",
  ...change,
});
let client: QueryClient;
let games: GroupLeaderboardResponse;
let searchedGames: GroupLeaderboardResponse;
let nextGames: GroupLeaderboardResponse;
let players: GroupLeaderboardResponse;
let nextPlayers: GroupLeaderboardResponse;
let gamesStatus: number;
let playersStatus: number;
let pendingGames: Promise<Response> | undefined;
let pendingPlayers: Promise<Response> | undefined;
const reads: URL[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(async () => {
  vi.clearAllMocks();
  boundary.userId = "owner";
  boundary.apiUrl = API;
  boundary.getToken.mockResolvedValue("fixture-leaderboard-token");
  games = {
    games: [{ id: 1, name: "Strategy game", imageUrl: null }],
    players: [],
    nextCursor: null,
  };
  searchedGames = {
    games: [{ id: 2, name: "Chess game", imageUrl: null }],
    players: [],
    nextCursor: null,
  };
  nextGames = {
    games: [{ id: 3, name: "Next game", imageUrl: null }],
    players: [],
    nextCursor: null,
  };
  players = {
    games: [],
    players: [
      player("admin", {
        groupRole: "ADMIN",
        provisional: true,
        avatarUrl: "https://images.fixture.test/admin.png",
      }),
      player("moderator", { groupRole: "MODERATOR", rating: null }),
      player("former", { left: true, groupRole: "ADMIN", username: null }),
      player("loading", { groupRole: undefined }),
    ],
    nextCursor: null,
  };
  nextPlayers = { games: [], players: [player("next-player")], nextCursor: null };
  gamesStatus = playersStatus = 200;
  pendingGames = pendingPlayers = undefined;
  reads.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        ![API, "https://other-leaderboard-fixtures.test"].includes(url.origin) ||
        !/^\/api\/(groups\/[^/]+|community)\/leaderboard$/.test(url.pathname)
      )
        throw new Error(`Unexpected fixture request: ${url.origin}${url.pathname}`);
      reads.push(url);
      const isPlayers = url.searchParams.has("gameId");
      const status = isPlayers ? playersStatus : gamesStatus;
      const pending = isPlayers ? pendingPlayers : pendingGames;
      if (pending) return pending;
      return json(
        status !== 200
          ? { error: "Fixture leaderboard unavailable" }
          : Number(url.searchParams.get("cursor")) > 0
            ? isPlayers
              ? nextPlayers
              : nextGames
            : isPlayers
              ? players
              : url.searchParams.has("query")
                ? searchedGames
                : games,
        status,
      );
    }),
  );
  await installNativePopoverMeasurements();
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  groupId = "group-one",
  header = <Text>Canonical group header</Text>,
  active = true,
  retained = false,
  global = false,
}: {
  groupId?: string;
  global?: boolean;
  header?: ReactNode;
  active?: boolean;
  retained?: boolean;
}) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <ListActivityContext value={{ current: active }}>
          {retained ? (
            <RetainedTabPanel active={active}>
              <Leaderboard groupId={global ? undefined : groupId} header={header} />
            </RetainedTabPanel>
          ) : (
            <Leaderboard groupId={global ? undefined : groupId} header={header} />
          )}
        </ListActivityContext>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function openGames() {
  await screen.findByTestId("rating-game-select-trigger");
  await positionMeasuredSelect(screen.getByTestId("rating-game-select-trigger"));
}
async function chooseGame(name = "Strategy game") {
  await openGames();
  // Real Select callback coverage only: its native animated opacity is a
  // snapshot in Node; physical overlay taps remain device acceptance.
  await fireEvent.press(await screen.findByRole("option", { name, includeHiddenElements: true }));
}
function listHost() {
  let current: ReturnType<typeof screen.getByText> | null =
    screen.getByText("Canonical group header");
  while (current && typeof current.props.onScroll !== "function") current = current.parent;
  if (!current) throw new Error("Expected actual native leaderboard scroll host");
  return current;
}
async function endPlayers(height = 1200) {
  await scrollNativeListToEnd(listHost(), height);
}

it("renders canonical role, former-member, provisional and statistical player facts after explicit game selection", async () => {
  await render(<Fixture />);
  await chooseGame();
  expect(await screen.findByText("@admin")).toBeVisible();
  expect(screen.getByText("@moderator")).toBeVisible();
  expect(screen.getByText("Username unavailable")).toBeVisible();
  expect(screen.getByText("Former group member")).toBeVisible();
  expect(screen.getByText("Not rated")).toBeVisible();
  expect(screen.getByRole("image", { name: "Provisional rating" })).toBeVisible();
  expect(screen.getByLabelText("Loading…")).toBeOnTheScreen();
  const admin = within(screen.getByTestId("group-ranking-player-admin"));
  for (const value of ["OpenSkill", "ND", "5", "2", "1", "25.50"])
    expect(admin.getByText(value)).toBeVisible();
  expect(screen.getByTestId("group-ranking-player-former")).toHaveStyle({ opacity: 0.55 });
  const avatar = screen
    .getByTestId("group-ranking-player-admin")
    .queryAll((node) => node.type === "RCTImageView")[0];
  if (!avatar) throw new Error("Expected actual avatar native image");
  await fireEvent(avatar, "error", { nativeEvent: { error: "Fixture avatar unavailable" } });
  expect(admin.getByText("a")).toBeVisible();
});

it("debounces four-character game discovery and preserves a selection found in a filtered canonical cache", async () => {
  await render(<Fixture />);
  await openGames();
  const input = screen.getByLabelText("Search board games", { includeHiddenElements: true });
  await fireEvent.changeText(input, "Che");
  expect(reads.some((url) => url.searchParams.has("query"))).toBe(false);
  await fireEvent.changeText(input, "Chess");
  const option = await screen.findByRole("option", {
    name: "Chess game",
    includeHiddenElements: true,
  });
  await fireEvent.press(option);
  expect(await screen.findByText("@admin")).toBeVisible();
  expect(screen.getByTestId("rating-game-select-trigger")).toHaveAccessibleName(
    "Board game: Chess game",
  );
  expect(reads.some((url) => url.searchParams.get("query") === "Chess")).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(screen.queryByText("@admin")).toBeNull();
  expect(screen.getByText("Select a board game")).toBeVisible();
});

it("separates no rated games, pending initial games and read failure with an explicit retry", async () => {
  let finish: (response: Response) => void = () => {};
  pendingGames = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText("No rated tables played in this group yet")).toBeNull();
  await act(() => finish(json({ error: "Fixture unavailable" }, 503)));
  expect(
    await screen.findByRole("button", { name: "Could not load leaderboards. Retry" }),
  ).toBeVisible();
  pendingGames = undefined;
  games = { games: [], players: [], nextCursor: null };
  await fireEvent.press(screen.getByRole("button", { name: "Could not load leaderboards. Retry" }));
  expect(await screen.findByText("No rated tables played in this group yet")).toBeVisible();
});

it("keeps selected players pending distinct from player failure and retries their real query", async () => {
  let finish: (response: Response) => void = () => {};
  pendingPlayers = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await chooseGame();
  expect(screen.queryByText("@admin")).toBeNull();
  await act(() => finish(json({ error: "Fixture players unavailable" }, 503)));
  expect(
    await screen.findByRole("button", { name: "Could not load leaderboards. Retry" }),
  ).toBeVisible();
  pendingPlayers = undefined;
  await fireEvent.press(screen.getByRole("button", { name: "Could not load leaderboards. Retry" }));
  expect(await screen.findByText("@admin")).toBeVisible();
});

it("scopes authoritative player facts to the new account, API and group instead of bridging private snapshots", async () => {
  const view = await render(<Fixture />);
  await chooseGame();
  await screen.findByText("@admin");
  boundary.userId = "other-owner";
  players = { ...players, players: [player("other-owner-player")] };
  await view.rerender(<Fixture />);
  expect(screen.queryByText("@admin")).toBeNull();
  expect(await screen.findByText("@other-owner-player")).toBeVisible();
  boundary.apiUrl = "https://other-leaderboard-fixtures.test";
  players = { ...players, players: [player("other-api-player")] };
  await view.rerender(<Fixture groupId="other-group" />);
  expect(screen.queryByText("@other-owner-player")).toBeNull();
  expect(await screen.findByText("@other-api-player")).toBeVisible();
  expect(reads.at(-1)?.pathname).toBe("/api/groups/other-group/leaderboard");
});

it("reveals retained player pages progressively without modifying or refetching canonical data", async () => {
  const key = ["groups", API, "owner", "rankings", "group-one", "players", 1, "rating", "desc"];
  const cached = {
    pages: [
      { games: [], players: [player("first")], nextCursor: 25 },
      { games: [], players: [player("second")], nextCursor: null },
    ],
    pageParams: [0, 25],
  };
  client.setQueryData(key, cached);
  await render(<Fixture />);
  await chooseGame();
  expect(screen.getByText("@first")).toBeVisible();
  expect(screen.queryByText("@second")).toBeNull();
  await endPlayers();
  expect(await screen.findByText("@second")).toBeVisible();
  expect(client.getQueryData(key)).toBe(cached);
  expect(reads.filter((url) => url.searchParams.has("gameId"))).toHaveLength(0);
});

it("rejects inactive list paging, coalesces pending events and requires a deliberate failed-page retry", async () => {
  players = { ...players, nextCursor: 25 };
  const view = await render(<Fixture active={false} />);
  await chooseGame();
  await screen.findByText("@admin");
  await endPlayers();
  expect(reads.filter((url) => url.searchParams.get("cursor") === "25")).toHaveLength(0);
  await view.rerender(<Fixture active />);
  let finish: (response: Response) => void = () => {};
  pendingPlayers = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await endPlayers(1264);
  await waitFor(() =>
    expect(reads.filter((url) => url.searchParams.get("cursor") === "25")).toHaveLength(1),
  );
  await endPlayers(1328);
  expect(reads.filter((url) => url.searchParams.get("cursor") === "25")).toHaveLength(1);
  await act(() => finish(json({ error: "Fixture page unavailable" }, 503)));
  expect(
    await screen.findByRole("button", { name: "Could not load leaderboards. Retry" }),
  ).toBeVisible();
  pendingPlayers = undefined;
  await fireEvent.press(screen.getByRole("button", { name: "Could not load leaderboards. Retry" }));
  expect(await screen.findByText("@next-player")).toBeVisible();
});

it("loads more canonical game choices through the real selector's callback boundary", async () => {
  games = { ...games, nextCursor: 25 };
  await render(<Fixture />);
  await openGames();
  await fireEvent.press(
    screen.getByRole("button", { name: "Load more games", includeHiddenElements: true }),
  );
  expect(
    await screen.findByRole("option", { name: "Next game", includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(
    reads.some((url) => !url.searchParams.has("gameId") && url.searchParams.get("cursor") === "25"),
  ).toBe(true);
});

it("renders current canonical rating updates while keeping the user's selected game", async () => {
  await render(<Fixture />);
  await chooseGame();
  await screen.findByText("@admin");
  await act(() =>
    client.setQueryData(
      ["groups", API, "owner", "rankings", "group-one", "players", 1, "rating", "desc"],
      {
        pages: [
          {
            games: [],
            players: [player("admin", { rating: 35.25, groupRole: "MEMBER" })],
            nextCursor: null,
          },
        ],
        pageParams: [0],
      },
    ),
  );
  expect(await screen.findByText("35.25")).toBeVisible();
  expect(screen.getByTestId("rating-game-select-trigger")).toHaveAccessibleName(
    "Board game: Strategy game",
  );
  expect(screen.queryByText("25.50")).toBeNull();
});

it("normalizes public handles and preserves every authoritative role boundary without exposing full names", async () => {
  const roles = ["ADMIN", "MODERATOR", "MEMBER", null, undefined] as const;
  players = {
    games: [],
    players: roles.map((groupRole, index) =>
      player(`role-${index}`, {
        groupRole,
        name: `Private Full Name ${index}`,
        username: `@@handle-${index}`,
      }),
    ),
    nextCursor: null,
  };
  await render(<Fixture />);
  await chooseGame();
  await screen.findByText("@handle-0");
  const labels = ["Admin", "Moderator", "Accepted member"];
  for (const [index, role] of roles.entries()) {
    const row = within(screen.getByTestId(`group-ranking-player-role-${index}`));
    expect(row.getByText(`@handle-${index}`)).toBeVisible();
    expect(row.queryByText(`Private Full Name ${index}`)).toBeNull();
    if (role === "ADMIN" || role === "MODERATOR" || role === "MEMBER") {
      expect(row.getByText(labels[index])).toBeVisible();
      expect(row.getByRole("button", { name: labels[index] })).toBeEnabled();
    } else {
      expect(row.queryAllByRole("button")).toEqual([]);
      if (role === undefined) expect(row.getByLabelText("Loading…")).toBeOnTheScreen();
      else expect(row.queryByLabelText("Loading…")).toBeNull();
    }
  }
});

it("retains the actual scroll header through pending, error, empty and unselected-ready ranking states", async () => {
  let finish: (response: Response) => void = () => {};
  pendingGames = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  const header = screen.getByText("Canonical group header");
  const assertHeader = () => {
    const list = listHost();
    expect(within(list).getByText("Canonical group header")).toBe(header);
    const content = list.children.find(
      (node) => typeof node !== "string" && typeof node.props.onLayout === "function",
    );
    if (!content || typeof content === "string")
      throw new Error("Expected actual native list content");
    expect(content).toHaveStyle({ padding: 20, paddingTop: 0 });
    expect(screen.queryAllByTestId(/^group-ranking-player-/)).toHaveLength(0);
  };
  assertHeader();
  await act(() => finish(json({ error: "Fixture games unavailable" }, 503)));
  await screen.findByRole("button", { name: "Could not load leaderboards. Retry" });
  assertHeader();
  pendingGames = undefined;
  games = { games: [], players: [], nextCursor: null };
  await fireEvent.press(screen.getByRole("button", { name: "Could not load leaderboards. Retry" }));
  await screen.findByText("No rated tables played in this group yet");
  assertHeader();
  await act(() =>
    client.setQueryData(["groups", API, "owner", "rankings", "group-one", "games", ""], {
      pages: [
        {
          games: [{ id: 1, name: "Strategy game", imageUrl: null }],
          players: [],
          nextCursor: null,
        },
      ],
      pageParams: [0],
    }),
  );
  await screen.findByTestId("rating-game-select-trigger");
  assertHeader();
  expect(reads.some((url) => url.searchParams.has("gameId"))).toBe(false);
});

it("resets a genuinely retained ranking window on hide and requires a new active drag without changing canonical pages", async () => {
  const key = ["groups", API, "owner", "rankings", "group-one", "players", 1, "rating", "desc"];
  const cached = client.setQueryData(key, {
    pages: [
      { games: [], players: [player("first")], nextCursor: 25 },
      { games: [], players: [player("second")], nextCursor: 50 },
      { games: [], players: [player("third")], nextCursor: null },
    ],
    pageParams: [0, 25, 50],
  });
  const view = await render(<Fixture retained />);
  await chooseGame();
  expect(screen.getByText("@first")).toBeVisible();
  expect(screen.queryByText("@second")).toBeNull();
  const header = screen.getByText("Canonical group header");
  const list = listHost();
  const queuedScroll = list.props.onScroll;
  const deliverQueuedEnd = async () =>
    act(() =>
      queuedScroll({
        timeStamp: Date.now(),
        nativeEvent: {
          contentOffset: { x: 0, y: 700 },
          contentSize: { width: 390, height: 1200 },
          layoutMeasurement: { width: 390, height: 500 },
          zoomScale: 1,
        },
      }),
    );
  await deliverQueuedEnd();
  expect(screen.queryByText("@second")).toBeNull();
  await endPlayers();
  expect(await screen.findByText("@second")).toBeVisible();
  await view.rerender(<Fixture retained active={false} />);
  await deliverQueuedEnd();
  expect(screen.getByText("Canonical group header", { includeHiddenElements: true })).toBe(header);
  await view.rerender(<Fixture retained />);
  expect(screen.getByText("Canonical group header")).toBe(header);
  expect(screen.getByText("@first")).toBeVisible();
  expect(screen.queryByText("@second")).toBeNull();
  expect(screen.queryByText("@third")).toBeNull();
  await deliverQueuedEnd();
  expect(screen.queryByText("@second")).toBeNull();
  await endPlayers(1264);
  expect(await screen.findByText("@second")).toBeVisible();
  expect(client.getQueryData(key)).toBe(cached);
  expect(reads.filter((url) => url.searchParams.has("gameId"))).toHaveLength(0);
});

it("keeps a new game's pending page isolated when an older game's request completes", async () => {
  games = { ...games, games: [...games.games, ...searchedGames.games] };
  const key = (id: number) => [
    "groups",
    API,
    "owner",
    "rankings",
    "group-one",
    "players",
    id,
    "rating",
    "desc",
  ];
  for (const id of [1, 2])
    client.setQueryData(key(id), {
      pages: [{ games: [], players: [player(`game-${id}-first`)], nextCursor: 25 }],
      pageParams: [0],
    });
  await render(<Fixture />);
  await chooseGame();
  let finishOld: (response: Response) => void = () => {};
  pendingPlayers = new Promise<Response>((resolve) => {
    finishOld = resolve;
  });
  await endPlayers();
  const nextReads = (id: number) =>
    reads.filter(
      (url) =>
        url.searchParams.get("gameId") === String(id) && url.searchParams.get("cursor") === "25",
    );
  await waitFor(() => expect(nextReads(1)).toHaveLength(1));
  await chooseGame("Chess game");
  expect(screen.getByText("@game-2-first")).toBeVisible();
  expect(screen.queryByText("@game-1-first")).toBeNull();
  let finishCurrent: (response: Response) => void = () => {};
  pendingPlayers = new Promise<Response>((resolve) => {
    finishCurrent = resolve;
  });
  await endPlayers(1264);
  await waitFor(() => expect(nextReads(2)).toHaveLength(1));
  await act(() =>
    finishOld(json({ games: [], players: [player("old-late-player")], nextCursor: null })),
  );
  expect(screen.queryByText("@old-late-player")).toBeNull();
  await endPlayers(1328);
  expect(nextReads(1)).toHaveLength(1);
  expect(nextReads(2)).toHaveLength(1);
  await act(() =>
    finishCurrent(json({ games: [], players: [player("current-next-player")], nextCursor: null })),
  );
  expect(await screen.findByText("@current-next-player")).toBeVisible();
  expect(screen.queryByText("@old-late-player")).toBeNull();
  expect(screen.getByTestId("rating-game-select-trigger")).toHaveAccessibleName(
    "Board game: Chess game",
  );
});

it("uses native menu and direction controls to order the global leaderboard at the source", async () => {
  players = {
    ...players,
    players: [player("global-player", { groupRole: undefined, position: 1 })],
  };
  await render(<Fixture global />);
  expect(await screen.findByText("Choose a game to see the leaderboard")).toBeVisible();
  await chooseGame();
  expect(await screen.findByText("@global-player")).toBeVisible();
  expect(screen.queryByText("Accepted member")).toBeNull();
  const playerReads = () => reads.filter((url) => url.searchParams.has("gameId"));
  expect(playerReads()[0].pathname).toBe("/api/community/leaderboard");
  expect(playerReads()[0].searchParams.get("sort")).toBe("rating");
  await fireEvent.press(screen.getByTestId("ranking-sort-metric"));
  const menus = () =>
    screen.container.queryAll(
      (node) => node.props.role === "menu" && typeof node.props.onLayout === "function",
    );
  await waitFor(() => expect(menus()).toHaveLength(1));
  const [menu] = menus();
  // RN's test renderer has no Yoga layout. Deliver the real HeroUI menu's two layout passes.
  for (let pass = 0; pass < 2; pass++) {
    const style = StyleSheet.flatten(menu.props.style);
    const x = typeof style?.left === "number" ? style.left : 0;
    const y = typeof style?.top === "number" ? style.top : Dimensions.get("screen").height;
    await fireEvent.layout(menu, { x, y, width: 220, height: 180 });
  }
  expect(menu.props.pointerEvents).not.toBe("none");
  const won = await screen.findByRole("menuitem", {
    name: "Games won",
    includeHiddenElements: true,
  });
  await fireEvent.press(won);
  await waitFor(() => {
    expect(playerReads().at(-1)?.searchParams.get("sort")).toBe("gamesWon");
    expect(playerReads().at(-1)?.searchParams.get("direction")).toBe("desc");
  });
  expect(await screen.findByText("#1")).toBeVisible();
  await fireEvent.press(screen.getByTestId("ranking-sort-direction"));
  await waitFor(() => {
    expect(playerReads().at(-1)?.searchParams.get("sort")).toBe("gamesWon");
    expect(playerReads().at(-1)?.searchParams.get("direction")).toBe("asc");
  });
  expect(await screen.findByText("#1")).toBeVisible();
  await fireEvent.press(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(screen.getByText("Choose a game to see the leaderboard")).toBeVisible();
  expect(screen.queryByText("@global-player")).toBeNull();
});
