import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Leaderboard } from "@/components/ratings/Leaderboard";
import { renderWithI18n } from "@/test-utils";

const boundary = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "ranking-viewer", getToken: boundary.getToken }),
}));
const groupId = "11111111-1111-4111-8111-111111111111";
const game = { id: 1, name: "Strategy game", imageUrl: null };
const player: GroupLeaderboardResponse["players"][number] = {
  userId: "player-one",
  name: "Private full name",
  username: "player-one",
  avatarUrl: null,
  gamesPlayed: 8,
  gamesWon: 2,
  nd: 1,
  rating: null,
  provisional: false,
  left: false,
  groupRole: "MEMBER",
};
let games: GroupLeaderboardResponse;
let players: GroupLeaderboardResponse;
let gamesStatus: number;
let playersStatus: number;
let pageStatus: number;
let pending: Promise<Response> | undefined;
let client: QueryClient;
const reads: URL[] = [];
const json = (body: unknown, status = 200) => Response.json(body, { status });
beforeEach(() => {
  vi.clearAllMocks();
  boundary.getToken.mockResolvedValue("fresh-ranking-token");
  games = { games: [game], players: [], nextCursor: null };
  players = { games: [], players: [player], nextCursor: null };
  gamesStatus = playersStatus = pageStatus = 200;
  pending = undefined;
  reads.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.pathname).toMatch(new RegExp(`^/api/(groups/${groupId}|community)/leaderboard$`));
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-ranking-token");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      reads.push(url);
      const isPlayers = url.searchParams.has("gameId");
      const next = url.searchParams.get("cursor") === "25";
      if (pending && (isPlayers || next)) return pending;
      const status = next ? pageStatus : isPlayers ? playersStatus : gamesStatus;
      return json(
        status !== 200
          ? { error: "Fixture ranking unavailable" }
          : next
            ? isPlayers
              ? {
                  games: [],
                  players: [
                    { ...player, userId: "next-player", username: "next-player", rating: 530 },
                  ],
                  nextCursor: null,
                }
              : {
                  games: [{ id: 2, name: "Next game", imageUrl: null }],
                  players: [],
                  nextCursor: null,
                }
            : isPlayers
              ? players
              : games,
        status,
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});
function mount(scope: { groupId?: string; groupName?: string } = { groupId }) {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <Leaderboard {...scope} />
    </QueryClientProvider>,
  );
}
async function chooseGame() {
  fireEvent.click(await screen.findByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Strategy game" }));
}
const playerReads = () => reads.filter((url) => url.searchParams.has("gameId"));

it("keeps selected ranking loading distinct from failure, retries only players and never fabricates a missing rating", async () => {
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending ranking");
  };
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  mount();
  await chooseGame();
  expect(screen.queryByRole("grid")).toBeNull();
  await act(() => finish(json({ error: "Fixture ranking unavailable" }, 503)));
  const retry = await screen.findByRole("button", { name: "Could not load leaderboards. Retry" });
  expect(screen.queryByText("No rated tables played in this group yet")).toBeNull();
  pending = undefined;
  fireEvent.click(retry);
  expect(await screen.findByRole("grid", { name: "Group leaderboard" })).toBeVisible();
  expect(screen.getByText("Not rated")).toBeVisible();
  expect(screen.queryByText("Private full name")).toBeNull();
  expect(playerReads()).toHaveLength(2);
  expect(reads.filter((url) => !url.searchParams.has("gameId"))).toHaveLength(1);
});

it("appends canonical player pages and recovers a failed cursor without removing already loaded rows", async () => {
  players.nextCursor = 25;
  mount();
  await chooseGame();
  await screen.findByText("@player-one");
  pageStatus = 503;
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  const retry = await screen.findByRole("button", { name: "Could not load leaderboards. Retry" });
  expect(screen.getByText("@player-one")).toBeVisible();
  pageStatus = 200;
  fireEvent.click(retry);
  expect(await screen.findByText("@next-player")).toBeVisible();
  expect(screen.getByText("@player-one")).toBeVisible();
  expect(screen.getByText("530.00")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(playerReads().map((url) => url.searchParams.get("cursor"))).toEqual(["0", "25", "25"]);
});

it("disables game pagination during an actual pending page while preserving selected options", async () => {
  games.nextCursor = 25;
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /Board game/ }));
  await screen.findByRole("option", { name: "Strategy game" });
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending game page");
  };
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  fireEvent.click(screen.getByRole("button", { name: "Load more games" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Load more games" })).toBeDisabled(),
  );
  expect(screen.getByRole("option", { name: "Strategy game" })).toBeVisible();
  pending = undefined;
  await act(() =>
    finish(
      json({
        games: [{ id: 2, name: "Next game", imageUrl: null }],
        players: [],
        nextCursor: null,
      }),
    ),
  );
  expect(await screen.findByRole("option", { name: "Next game" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more games" })).toBeNull();
  expect(playerReads()).toHaveLength(0);
  expect(reads.at(-1)?.searchParams.get("cursor")).toBe("25");
});

it("pages from the browser intersection boundary only at the end and coalesces a pending request", async () => {
  const observers: BrowserIntersectionObserver[] = [];
  class BrowserIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin: string;
    readonly thresholds = [0];
    readonly scrollMargin = "0px";
    readonly delay = 0;
    readonly trackVisibility = false;
    private readonly targets = new Set<Element>();
    constructor(
      private readonly callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      this.rootMargin = options?.rootMargin ?? "0px";
      observers.push(this);
    }
    observe(target: Element) {
      this.targets.add(target);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    intersect(isIntersecting: boolean) {
      this.callback(
        [...this.targets].map((target) => ({
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: performance.now(),
        })),
        this,
      );
    }
  }
  vi.stubGlobal("IntersectionObserver", BrowserIntersectionObserver);
  players.nextCursor = 25;
  mount();
  await chooseGame();
  await screen.findByText("@player-one");
  const end = observers.find((observer) => observer.rootMargin === "300px");
  if (!end) throw new Error("Expected the actual leaderboard end sentinel observer");
  act(() => end.intersect(false));
  expect(playerReads()).toHaveLength(1);
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending observed page");
  };
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  act(() => {
    end.intersect(true);
    end.intersect(true);
  });
  await waitFor(() => expect(playerReads()).toHaveLength(2));
  expect(screen.getByRole("button", { name: "Load more" })).toBeDisabled();
  pending = undefined;
  await act(() =>
    finish(
      json({
        games: [],
        players: [{ ...player, userId: "next-player", username: "next-player" }],
        nextCursor: null,
      }),
    ),
  );
  expect(await screen.findByText("@next-player")).toBeVisible();
  expect(playerReads()).toHaveLength(2);
  expect(boundary.getToken).toHaveBeenCalledTimes(reads.length);
});

it.each([
  ["Games played", "gamesPlayed"],
  ["Games won", "gamesWon"],
  ["ND", "nd"],
])(
  "orders the selected group game by %s on the server and keeps rating positions stable",
  async (label, sort) => {
    players = {
      ...players,
      players: [{ ...player, rating: 515, position: 2 }],
    };
    mount({ groupId, groupName: "Game night" });
    expect(await screen.findByText("Game night")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "How OpenSkill works" }));
    const help = await screen.findByRole("dialog", { name: "How OpenSkill works" });
    expect(help).toBeVisible();
    expect(help).toHaveTextContent(
      "This leaderboard only includes rated results from this group’s events.",
    );
    expect(
      within(help)
        .getByRole("heading", { name: "How OpenSkill works" })
        .querySelector(".lucide-chart-no-axes-column-increasing"),
    ).not.toBeNull();
    expect(help.querySelector(".lucide-clock-3 + p")).toHaveTextContent(
      "The clock marks a provisional rating",
    );
    fireEvent.keyDown(help, { key: "Escape" });
    await chooseGame();
    expect(await screen.findByRole("img", { name: "Position: #2" })).toBeVisible();
    expect(playerReads()[0].searchParams.get("sort")).toBe("rating");
    expect(playerReads()[0].searchParams.get("direction")).toBe("desc");
    fireEvent.click(screen.getByRole("button", { name: /^Sort by/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: label }));
    await waitFor(() => {
      const search = playerReads().at(-1)?.searchParams;
      expect(search?.get("sort")).toBe(sort);
      expect(search?.get("direction")).toBe("desc");
    });
    expect(await screen.findByRole("img", { name: "Position: #2" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
    await waitFor(() => {
      const search = playerReads().at(-1)?.searchParams;
      expect(search?.get("sort")).toBe(sort);
      expect(search?.get("direction")).toBe("asc");
      expect(search?.get("cursor")).toBe("0");
    });
    expect(await screen.findByRole("img", { name: "Position: #2" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
    expect(screen.getByText("Choose a game to see the leaderboard")).toBeVisible();
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sort descending" })).toBeNull();
  },
);

it("loads a separate global game catalog and ranked players without using group authority", async () => {
  players = {
    ...players,
    players: [{ ...player, groupRole: undefined, rating: 515, position: 1 }],
  };
  mount({});
  expect(await screen.findByText("Choose a game to see the leaderboard")).toBeVisible();
  expect(playerReads()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "How OpenSkill works" }));
  const help = await screen.findByRole("dialog", { name: "How OpenSkill works" });
  expect(help).toHaveTextContent(
    "For each game, the global leaderboard includes all rated matches from private and public events.",
  );
  fireEvent.keyDown(help, { key: "Escape" });
  await chooseGame();
  expect(await screen.findByRole("grid", { name: "Global leaderboard" })).toBeVisible();
  expect(screen.getByText("@player-one")).toBeVisible();
  expect(screen.queryByText("Accepted member")).toBeNull();
  expect(screen.queryByText("Private full name")).toBeNull();
  expect(reads.map((url) => url.pathname)).toEqual([
    "/api/community/leaderboard",
    "/api/community/leaderboard",
  ]);
});

it("keeps a truly empty global leaderboard distinct from an unselected game", async () => {
  games = { ...games, games: [] };
  mount({});
  expect(await screen.findByText("No rated tables played yet")).toBeVisible();
  expect(screen.queryByText("Choose a game to see the leaderboard")).toBeNull();
  expect(playerReads()).toHaveLength(0);
});

it("retries a failed catalog cursor while preserving the selected game and its ranking", async () => {
  games.nextCursor = 25;
  mount();
  await chooseGame();
  await screen.findByText("@player-one");
  fireEvent.click(screen.getByRole("button", { name: /Strategy game Board game/ }));
  const choice = await screen.findByRole("option", { name: "Strategy game", selected: true });
  const overlay = choice.closest<HTMLElement>("[data-input-overlay]");
  if (!overlay) throw new Error("Expected the actual game picker popup");
  const picker = within(overlay);
  pageStatus = 503;
  fireEvent.click(picker.getByRole("button", { name: "Load more games" }));
  await waitFor(() =>
    expect(
      client
        .getQueryCache()
        .findAll()
        .some((query) => query.queryKey.includes("games") && query.state.status === "error"),
    ).toBe(true),
  );
  expect(picker.getByRole("option", { name: "Strategy game", selected: true })).toBeVisible();
  pageStatus = 200;
  fireEvent.click(picker.getByRole("button", { name: "Load more games" }));
  expect(await picker.findByRole("option", { name: "Next game" })).toBeVisible();
  fireEvent.keyDown(picker.getByRole("searchbox", { name: "Search board games" }), {
    key: "Escape",
  });
  expect(screen.getByRole("grid", { name: "Group leaderboard" })).toBeVisible();
  expect(screen.getByText("@player-one")).toBeVisible();
  expect(
    reads
      .filter((read) => !read.searchParams.has("gameId"))
      .map((read) => read.searchParams.get("cursor")),
  ).toEqual(["0", "25", "25"]);
  expect(playerReads()).toHaveLength(1);
});

it("keeps the selected game while recovering an errored catalog refresh", async () => {
  mount();
  await chooseGame();
  await screen.findByText("@player-one");
  gamesStatus = 503;
  await act(async () => {
    await client.refetchQueries({ predicate: (query) => query.queryKey.includes("games") });
  });
  const retry = await screen.findByRole("button", { name: "Could not load leaderboards. Retry" });
  expect(screen.getByRole("grid", { name: "Group leaderboard" })).toBeVisible();
  expect(screen.getByText("@player-one")).toBeVisible();
  gamesStatus = 200;
  fireEvent.click(retry);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Could not load leaderboards. Retry" })).toBeNull(),
  );
  expect(screen.getByText("@player-one")).toBeVisible();
  expect(playerReads()).toHaveLength(1);
});

it("distinguishes a selected unrated game from an empty ranking catalog and can reset to the chooser", async () => {
  players.players = [];
  mount({});
  await chooseGame();
  expect(await screen.findByText("No leaderboard for this game yet")).toBeVisible();
  expect(screen.queryByRole("grid")).toBeNull();
  expect(screen.queryByText("No rated tables played yet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(screen.getByText("Choose a game to see the leaderboard")).toBeVisible();
  expect(screen.queryByText("No leaderboard for this game yet")).toBeNull();
  expect(playerReads()).toHaveLength(1);
});

it("shows an active compact leaderboard row and reveals its statistics on demand", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: query === "(max-width: 639px)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  mount();
  await chooseGame();
  const row = within(await screen.findByTestId("group-ranking-player-player-one"));
  expect(row.getByText("@player-one")).toBeVisible();
  expect(row.queryByText("Former group member")).toBeNull();
  expect(row.queryByText("Wins")).toBeNull();
  const details = row.getByRole("button", { name: /Game statistics: @player-one/ });
  fireEvent.click(details);
  expect(details).toHaveAttribute("aria-expanded", "true");
  expect(row.getByText("Played")).toBeVisible();
  expect(row.getByText("8")).toBeVisible();
  expect(row.getByText("Wins")).toBeVisible();
  expect(row.getByText("2")).toBeVisible();
  expect(row.getByText("ND")).toBeVisible();
  expect(row.getByText("1")).toBeVisible();
});
