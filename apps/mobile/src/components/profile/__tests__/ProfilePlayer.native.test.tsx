import { URL } from "node:url";
import type {
  ProfileRatingGame,
  ProfileRatingGames,
  ProfileRatingHistory,
} from "@board-game-organizer/schemas";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { positionMeasuredSelect } from "@/test/nativeSelectGeometry";
import { ProfilePlayer } from "../ProfilePlayer";
import { ProfileStats } from "../ProfileStats";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://profile-player-native.test",
  userId: "viewer",
}));
const options = () => ({
  apiUrl: boundary.apiUrl,
  userId: boundary.userId,
  enabled: true,
  getToken: async () => `fixture-${boundary.userId}`,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));
vi.mock("expo-router", () => ({ useNavigation: () => ({ getState: () => ({ type: "stack" }) }) }));
const chess: ProfileRatingGame = { id: 1, name: "Chess ranked", imageUrl: null };
const cascadia: ProfileRatingGame = { id: 2, name: "Cascadia ranked", imageUrl: null };
let client: QueryClient;
let games: ProfileRatingGames;
let moreGames: ProfileRatingGames;
let rating: ProfileRatingHistory;
let earlier: ProfileRatingHistory;
let gamesCode: number;
let moreCode: number;
let ratingCode: number;
let earlierCode: number;
let pendingGames: Promise<Response> | undefined;
let pendingRating: Promise<Response> | undefined;
let pendingEarlier: Promise<Response> | undefined;
const reads: { url: URL; authorization: string | null }[] = [];
const json = (body: unknown, status = 200) => Response.json(body, { status });
const key = (subject = "subject") => JSON.stringify([boundary.apiUrl, boundary.userId, subject]);
beforeEach(async () => {
  vi.clearAllMocks();
  boundary.apiUrl = "https://profile-player-native.test";
  boundary.userId = "viewer";
  useAppStore.getState().clearProfileViews();
  reads.length = 0;
  games = { items: [chess, cascadia], nextCursor: null };
  moreGames = { items: [{ id: 3, name: "Azul ranked", imageUrl: null }], nextCursor: null };
  rating = {
    game: chess,
    rating: 33.25,
    delta: 1.5,
    stats: { gamesPlayed: 12, gamesWon: 4, winRate: 33.33 },
    points: [
      { ordinal: 1, rating: 31.75, delta: 0.5 },
      { ordinal: 2, rating: 33.25, delta: 1.5 },
    ],
    nextCursor: null,
  };
  earlier = { ...rating, points: [{ ordinal: 0, rating: 31.25, delta: 0.25 }], nextCursor: null };
  gamesCode = moreCode = ratingCode = earlierCode = 200;
  pendingGames = pendingRating = pendingEarlier = undefined;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await installNativePopoverMeasurements();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== boundary.apiUrl || (init?.method ?? "GET") !== "GET")
        throw new Error(`Unexpected player fixture request ${url.origin}${url.pathname}`);
      reads.push({ url, authorization: new Headers(init?.headers).get("authorization") });
      const match = /^\/api\/profiles\/([^/]+)\/games(?:\/(\d+))?$/.exec(url.pathname);
      if (!match) throw new Error(`Unexpected player fixture path ${url.pathname}`);
      if (!match[2]) {
        const more = Number(url.searchParams.get("cursor")) > 0,
          code = more ? moreCode : gamesCode;
        return (
          pendingGames ??
          json(
            code === 200
              ? more
                ? moreGames
                : {
                    ...games,
                    items: games.items.filter((game) =>
                      game.name
                        .toLowerCase()
                        .includes((url.searchParams.get("query") ?? "").toLowerCase()),
                    ),
                  }
              : { error: "Fixture rated games unavailable" },
            code,
          )
        );
      }
      const more = url.searchParams.has("cursor"),
        code = more ? earlierCode : ratingCode;
      return (
        (more ? pendingEarlier : pendingRating) ??
        json(
          code === 200 ? (more ? earlier : rating) : { error: "Fixture rating unavailable" },
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
  useAppStore.getState().clearProfileViews();
});
function Fixture({ subject = "subject" }: { subject?: string }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <ProfilePlayer userId={subject} viewKey={key(subject)} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function open() {
  await positionMeasuredSelect(screen.getByTestId("rating-game-select-trigger"));
}
async function choose(name = "Chess ranked") {
  await open();
  // Real Select's state callbacks only: Node cannot establish native animated tappability.
  await fireEvent.press(await screen.findByRole("option", { name, includeHiddenElements: true }));
}
async function ready() {
  await waitFor(() => expect(client.isFetching()).toBe(0));
}
function ratingKey(subject = "subject", id = 1) {
  return ["profile", boundary.apiUrl, boundary.userId, "rating", subject, id];
}
function gamesKey(subject = "subject", query = "") {
  return ["profile", boundary.apiUrl, boundary.userId, "games", subject, query];
}

it("does not request a rating until the viewer chooses a specific board game", async () => {
  await render(<Fixture />);
  await ready();
  expect(screen.getByText("Select a board game")).toBeVisible();
  expect(screen.queryByText(/Current rating:/)).toBeNull();
  expect(reads).toHaveLength(1);
  expect(reads[0].authorization).toBe("Bearer fixture-viewer");
  expect(reads[0].url.pathname).toBe("/api/profiles/subject/games");
});

it("selects a game through the actual control and renders current rating, chart and aggregate player facts", async () => {
  await render(<Fixture />);
  await ready();
  await choose();
  expect(await screen.findByText("Current rating: 33.25")).toBeVisible();
  expect(screen.getByText("Last rated game change: +1.5")).toBeVisible();
  expect(screen.getByLabelText("OpenSkill rating history")).toBeVisible();
  expect(screen.getByText("Games played")).toBeVisible();
  expect(screen.getByText("12")).toBeVisible();
  expect(screen.getByText("Games won")).toBeVisible();
  expect(screen.getByText("4")).toBeVisible();
  expect(useAppStore.getState().profileViews[key()]?.gameId).toBe(1);
  expect(reads.at(-1)?.url.pathname).toBe("/api/profiles/subject/games/1");
});

it.each([
  {
    ratingValue: null,
    delta: null,
    text: "Current rating: Unknown",
    change: "Last rated game change: —",
  },
  { ratingValue: 0, delta: 0, text: "Current rating: 0", change: "Last rated game change: +0" },
  {
    ratingValue: 20.5,
    delta: -2.75,
    text: "Current rating: 20.5",
    change: "Last rated game change: -2.75",
  },
])(
  "formats the actual nullable/zero/signed rating receipt: $text",
  async ({ ratingValue, delta, text, change }) => {
    rating = { ...rating, rating: ratingValue, delta, points: [] };
    useAppStore.getState().setProfileView(key(), { gameId: 1 });
    await render(<Fixture />);
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.getByText(change)).toBeVisible();
    expect(screen.getByText("Not enough ranked games for a chart")).toBeVisible();
  },
);

it("preserves the selected game's name from its authoritative history when a new filter omits that game", async () => {
  games = { items: [], nextCursor: null };
  useAppStore.getState().setProfileView(key(), { gameId: 1 });
  await render(<Fixture />);
  await screen.findByText("Current rating: 33.25");
  expect(screen.getByRole("combobox", { name: "Board game: Chess ranked" })).toBeVisible();
});

it("clears selected rating through the actual neutral control while retaining authoritative query data", async () => {
  useAppStore.getState().setProfileView(key(), { gameId: 1 });
  await render(<Fixture />);
  await screen.findByText("Current rating: 33.25");
  const cached = client.getQueryData(ratingKey());
  await userEvent.setup().press(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(screen.getByText("Select a board game")).toBeVisible();
  expect(screen.queryByText("Current rating: 33.25")).toBeNull();
  expect(client.getQueryData(ratingKey())).toBe(cached);
  expect(useAppStore.getState().profileViews[key()]?.gameId).toBeNull();
});

it("keeps an unresolved first game read distinct from a genuinely empty rated-games list", async () => {
  let finish: (value: Response) => void = () => {};
  pendingGames = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText("No rated games yet")).toBeNull();
  await act(() => finish(json({ items: [], nextCursor: null })));
  expect(await screen.findByText("No rated games yet")).toBeVisible();
});

it("keeps the current game selected while its first rating request is still pending", async () => {
  let finish: (value: Response) => void = () => {};
  pendingRating = new Promise((resolve) => {
    finish = resolve;
  });
  useAppStore.getState().setProfileView(key(), { gameId: 1 });
  await render(<Fixture />);
  await waitFor(() =>
    expect(reads.some(({ url }) => url.pathname.endsWith("/games/1"))).toBe(true),
  );
  expect(screen.queryByText(/Current rating:/)).toBeNull();
  expect(screen.queryByText("Could not load rating history")).toBeNull();
  await act(() => finish(json(rating)));
  expect(await screen.findByText("Current rating: 33.25")).toBeVisible();
});

it("recovers a failed game list through the header retry without requesting an unselected history", async () => {
  gamesCode = 503;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load rating history")).toBeVisible();
  expect(screen.queryByText("No rated games yet")).toBeNull();
  gamesCode = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  await ready();
  expect(screen.queryByText("Could not load rating history")).toBeNull();
  expect(reads.every(({ url }) => !url.pathname.endsWith("/games/1"))).toBe(true);
});

it("retries both selected-history and games sources after an ordinary rating failure", async () => {
  useAppStore.getState().setProfileView(key(), { gameId: 1 });
  ratingCode = 503;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load rating history")).toBeVisible();
  const before = reads.length;
  ratingCode = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Current rating: 33.25")).toBeVisible();
  expect(reads.slice(before).some(({ url }) => url.pathname.endsWith("/games"))).toBe(true);
  expect(reads.slice(before).some(({ url }) => url.pathname.endsWith("/games/1"))).toBe(true);
});

it("keeps usable cached rating facts during a failed refresh and removes them on a real access denial", async () => {
  useAppStore.getState().setProfileView(key(), { gameId: 1 });
  await render(<Fixture />);
  await screen.findByText("Current rating: 33.25");
  ratingCode = 503;
  await act(() => client.invalidateQueries({ queryKey: ratingKey(), exact: true }));
  expect(await screen.findByText("Could not load rating history")).toBeVisible();
  expect(screen.getByText("Current rating: 33.25")).toBeVisible();
  ratingCode = 404;
  await act(() => client.invalidateQueries({ queryKey: ratingKey(), exact: true }));
  await waitFor(() => expect(screen.queryByText("Current rating: 33.25")).toBeNull());
  expect(screen.queryByLabelText("OpenSkill rating history")).toBeNull();
});

it("reconciles a new canonical rating in place without resetting the selected game", async () => {
  useAppStore.getState().setProfileView(key(), { gameId: 1 });
  await render(<Fixture />);
  await screen.findByText("Current rating: 33.25");
  rating = { ...rating, rating: 40, delta: -0.5 };
  await act(() => client.invalidateQueries({ queryKey: ratingKey(), exact: true }));
  expect(await screen.findByText("Current rating: 40")).toBeVisible();
  expect(screen.getByText("Last rated game change: -0.5")).toBeVisible();
  expect(useAppStore.getState().profileViews[key()]?.gameId).toBe(1);
});

it("requests earlier rated games explicitly, coalesces the disabled control and merges native chart history", async () => {
  rating = { ...rating, nextCursor: 2 };
  useAppStore.getState().setProfileView(key(), { gameId: 1 });
  await render(<Fixture />);
  await screen.findByText("Current rating: 33.25");
  let finish: (value: Response) => void = () => {};
  pendingEarlier = new Promise((resolve) => {
    finish = resolve;
  });
  await userEvent.setup().press(screen.getByRole("button", { name: "Earlier rated games" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Earlier rated games" })).toBeDisabled(),
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Earlier rated games" }));
  expect(
    reads.filter(({ url }) => url.searchParams.has("cursor") && url.pathname.endsWith("/games/1")),
  ).toHaveLength(1);
  pendingEarlier = undefined;
  await act(() => finish(json(earlier)));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Earlier rated games" })).toBeNull(),
  );
  expect(screen.getByText("0")).toBeVisible();
  expect(screen.getByText("2")).toBeVisible();
  expect(screen.getByLabelText("OpenSkill rating history")).toBeVisible();
});

it("filters actual game choices after the debounce and supports clearing without dropping the selected rating", async () => {
  useAppStore.getState().setProfileView(key(), { gameId: 1 });
  await render(<Fixture />);
  await screen.findByText("Current rating: 33.25");
  await open();
  await fireEvent.changeText(
    screen.getByPlaceholderText("Filter games", { includeHiddenElements: true }),
    "Cascadia",
  );
  await waitFor(() =>
    expect(reads.some(({ url }) => url.searchParams.get("query") === "Cascadia")).toBe(true),
  );
  expect(client.getQueryData(gamesKey("subject", "Cascadia"))).toMatchObject({
    pages: [{ items: [cascadia] }],
  });
  expect(screen.getByText("Current rating: 33.25")).toBeVisible();
  // The input's native change/clear callback remains real, even while Select's overlay is state-only in Node.
  await fireEvent.changeText(
    screen.getByPlaceholderText("Filter games", { includeHiddenElements: true }),
    "",
  );
  await waitFor(() =>
    expect(screen.getByPlaceholderText("Filter games", { includeHiddenElements: true })).toHaveProp(
      "value",
      "",
    ),
  );
});

it("loads more game choices through the actual Select footer callback without changing the selected player rating", async () => {
  games = { ...games, nextCursor: 20 };
  await render(<Fixture />);
  await ready();
  await open();
  await fireEvent.press(
    screen.getByRole("button", { name: "Load more games", includeHiddenElements: true }),
  );
  expect(
    await screen.findByRole("option", { name: "Azul ranked", includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(reads.at(-1)?.url.searchParams.get("cursor")).toBe("20");
  expect(screen.queryByText(/Current rating:/)).toBeNull();
});

it("isolates stored selection and data when the viewer, API and profile subject change", async () => {
  useAppStore.getState().setProfileView(key(), { gameId: 1 });
  const view = await render(<Fixture />);
  await screen.findByText("Current rating: 33.25");
  boundary.userId = "another-viewer";
  boundary.apiUrl = "https://another-player-native.test";
  await view.rerender(<Fixture subject="another-subject" />);
  expect(screen.queryByText("Current rating: 33.25")).toBeNull();
  await ready();
  expect(screen.getByText("Select a board game")).toBeVisible();
  expect(reads.at(-1)?.authorization).toBe("Bearer fixture-another-viewer");
  expect(reads.at(-1)?.url.pathname).toBe("/api/profiles/another-subject/games");
});

it.each([
  { labels: ["Friends", "Followers", "Following"] },
  { labels: ["Games played", "Games won", "Win percentage"] },
  { labels: ["Games without expansions", "Games including expansions", "Wishlist"] },
])(
  "keeps actual native statistics naturally stretched and untruncated within their own $labels row",
  async ({ labels }) => {
    const items = labels.map((label) => ({ label, value: "12" }));
    const otherItems = ["Separate first", "Separate second", "Separate third"].map((label) => ({
      label,
      value: "99",
    }));
    const content = (current: typeof items) => (
      <NativeTestProviders>
        <ProfileStats items={current} />
        <ProfileStats items={otherItems} />
      </NativeTestProviders>
    );
    const view = await render(content(items));
    for (const label of labels) {
      const text = screen.getByText(label);
      expect(text).toBeVisible();
      expect(text.props.numberOfLines).toBeUndefined();
      const card = text.parent?.parent;
      const wrapper = card?.parent;
      const row = wrapper?.parent;
      if (!card || !wrapper || !row)
        throw new Error("Expected the real ProfileStats card and row hosts");
      expect(row).toHaveStyle({ flexDirection: "row", alignItems: "stretch" });
      expect(wrapper).toHaveStyle({ flex: 1, minWidth: 0 });
      expect(card).toHaveStyle({ flex: 1 });
      expect(StyleSheet.flatten(card.props.style)?.height).toBeUndefined();
    }
    // Supply the missing native text layout only; actual state aligns number
    // baselines within this row while another ProfileStats instance stays independent.
    const values = screen.getAllByText("12");
    await fireEvent.layout(values[0], { x: 0, y: 0, width: 80, height: 36 });
    for (const value of screen.getAllByText("12")) {
      if (!value.parent) throw new Error("Expected the actual number-layout host");
      expect(value.parent).toHaveStyle({ minHeight: 36 });
    }
    for (const value of screen.getAllByText("99")) {
      if (!value.parent) throw new Error("Expected the other row's number-layout host");
      expect(value.parent).toHaveStyle({ minHeight: 0 });
    }
    await view.rerender(content(items.map((item) => ({ ...item, value: "120" }))));
    for (const value of screen.getAllByText("120")) {
      if (!value.parent) throw new Error("Expected the new statistics scope's number-layout host");
      expect(value.parent).toHaveStyle({ minHeight: 0 });
    }
    expect(reads).toEqual([]);
  },
);

it("stops automatic game paging after a later cursor fails and retries only when explicitly requested", async () => {
  games = { ...games, nextCursor: 20 };
  moreCode = 503;
  await render(<Fixture />);
  await ready();
  await open();
  const list = screen.getByTestId("rating-game-select-list", { includeHiddenElements: true });
  const cursorRequests = () => reads.filter(({ url }) => url.searchParams.get("cursor") === "20");
  await scrollNativeListToEnd(list);
  await waitFor(() => expect(cursorRequests()).toHaveLength(1));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(
    screen.getByRole("option", { name: "Chess ranked", includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("option", { name: "Azul ranked", includeHiddenElements: true }),
  ).toBeNull();
  await scrollNativeListToEnd(list, 1328);
  expect(cursorRequests()).toHaveLength(1);

  moreCode = 200;
  await fireEvent.press(
    screen.getByRole("button", { name: "Load more games", includeHiddenElements: true }),
  );
  expect(
    await screen.findByRole("option", { name: "Azul ranked", includeHiddenElements: true }),
  ).toBeOnTheScreen();
  expect(cursorRequests()).toHaveLength(2);
  expect(screen.queryByText(/Current rating:/, { includeHiddenElements: true })).toBeNull();
});

it("retries the unavailable rating catalog from inside the open game selector", async () => {
  gamesCode = 503;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load rating history")).toBeVisible();
  await open();
  const selector = screen.getByTestId("rating-game-select-popover", {
    includeHiddenElements: true,
  });
  const retry = within(selector).getByRole("button", {
    name: "Try again",
    includeHiddenElements: true,
  });
  gamesCode = 200;
  await fireEvent.press(retry);
  expect(
    await within(selector).findByRole("option", {
      name: "Chess ranked",
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  expect(reads).toHaveLength(2);
  expect(reads.every(({ url }) => url.pathname === "/api/profiles/subject/games")).toBe(true);
});
