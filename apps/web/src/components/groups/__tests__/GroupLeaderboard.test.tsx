import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Leaderboard } from "@/components/ratings/Leaderboard";
import { LeaderboardView } from "@/components/ratings/LeaderboardView";
import { renderWithI18n } from "@/test-utils";

const picker = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "admin", getToken: vi.fn() }),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useLeaderboard: (args: unknown) => picker(args),
}));
const games = [
  { id: 1, name: "Azul", imageUrl: "data:image/svg+xml,%3Csvg/%3E" },
  { id: 2, name: "Cascadia", imageUrl: null },
];
const refresh = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  picker.mockReturnValue({
    games: { data: { games }, isPending: false, isError: false, refetch: refresh },
    players: {
      data: {
        pages: [
          {
            players: [
              {
                userId: "former",
                name: "Grace Hopper",
                username: "grace",
                avatarUrl: null,
                gamesPlayed: 2,
                gamesWon: 1,
                nd: 1,
                rating: 510.4,
                position: 4,
                provisional: true,
                left: true,
              },
            ],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: refresh,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    },
  });
});

it("shows empty group text without select", () => {
  picker.mockReturnValueOnce({
    games: { data: { games: [] }, isPending: false, isError: false },
    players: { data: undefined, hasNextPage: false },
  });
  renderWithI18n(<Leaderboard groupId="test" />);
  expect(screen.getByText("No rated tables played in this group yet")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Board game/ })).toBeNull();
});

it("keeps load failures observable and retryable", () => {
  picker.mockReturnValueOnce({
    games: { isPending: false, isError: true, refetch: refresh },
    players: { data: undefined, hasNextPage: false },
  });
  renderWithI18n(<Leaderboard groupId="test" />);
  fireEvent.click(screen.getByRole("button", { name: "Could not load leaderboards. Retry" }));
  expect(refresh).toHaveBeenCalledOnce();
});

it("filters by selected game and identifies provisional former members", async () => {
  renderWithI18n(<Leaderboard groupId="test" />);
  expect(screen.queryByRole("grid")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  const azul = await screen.findByRole("option", { name: "Azul" });
  expect(azul.querySelector("img")?.getAttribute("src")).toBe(games[0].imageUrl);
  fireEvent.click(azul);
  expect(picker).toHaveBeenLastCalledWith(expect.objectContaining({ gameId: 1 }));
  expect(screen.getByRole("grid")).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "ND" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "OpenSkill" })).toBeTruthy();
  const trigger = screen.getByRole("button", { name: /Azul Board game/ });
  expect(trigger.querySelector("img")).toBeTruthy();
  expect(trigger.querySelector('[data-slot="selected-game-name"]')?.textContent?.trim()).toBe(
    "Azul",
  );
  expect(trigger.parentElement).toBe(
    screen.getByRole("button", { name: "Clear board game selection" }).parentElement,
  );
  expect(screen.getByText("@grace")).toBeTruthy();
  expect(screen.queryByText("Grace Hopper")).toBeNull();
  expect(screen.getByText("Former group member")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Provisional rating" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  const search = screen.getByRole("searchbox", { name: "Search board games" });
  fireEvent.change(search, { target: { value: "cas" } });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(screen.getByRole("option", { name: "Azul" })).toBeTruthy();
  fireEvent.change(search, { target: { value: "casc" } });
  await waitFor(() => expect(screen.queryByRole("option", { name: "Azul" })).toBeNull());
  expect(screen.getByRole("option", { name: "Cascadia" })).toBeTruthy();
  fireEvent.change(search, { target: { value: "xxxx" } });
  await screen.findByText("No games found");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(await screen.findByRole("option", { name: "Azul" })).toBeTruthy();
  fireEvent.click(await screen.findByRole("option", { name: "Cascadia" }));
  expect(picker).toHaveBeenLastCalledWith(expect.objectContaining({ gameId: 2 }));
  fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(picker).toHaveBeenLastCalledWith(expect.objectContaining({ gameId: null }));
  expect(screen.queryByRole("grid")).toBeNull();
});

it.each([
  ["ADMIN", "Admin"],
  ["MODERATOR", "Moderator"],
  ["MEMBER", "Accepted member"],
] as const)(
  "uses the Members-tab %s role badge, popover and secondary label",
  async (groupRole, label) => {
    const state = picker();
    const original = state.players.data.pages[0].players[0];
    picker.mockReturnValue({
      ...state,
      players: {
        ...state.players,
        data: {
          pages: [{ players: [{ ...original, username: "@@grace", groupRole, left: false }] }],
        },
      },
    });
    renderWithI18n(<Leaderboard groupId="test" />);
    fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Azul" }));
    expect(screen.getByText("@grace")).toBeTruthy();
    expect(screen.queryByText("Grace Hopper")).toBeNull();
    expect(screen.getByText(label)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: label }));
    const popover = await screen.findByRole("dialog");
    expect(within(popover).getByRole("heading", { name: "Roles and participation" })).toBeTruthy();
    expect(within(popover).getByText(label)).toBeTruthy();
  },
);

it.each([null, undefined])(
  "does not invent a role or expose real-name fallback when cached role=%s",
  async (groupRole) => {
    const state = picker();
    const original = state.players.data.pages[0].players[0];
    picker.mockReturnValue({
      ...state,
      players: {
        ...state.players,
        data: { pages: [{ players: [{ ...original, username: null, groupRole, left: false }] }] },
      },
    });
    renderWithI18n(<Leaderboard groupId="test" />);
    fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Azul" }));
    expect(screen.getByText("Username unavailable")).toBeTruthy();
    expect(screen.queryByText("Grace Hopper")).toBeNull();
    for (const label of ["Admin", "Moderator", "Accepted member"])
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    expect(screen.queryByLabelText("Loading…") !== null).toBe(groupRole === undefined);
  },
);

it("bounds retained web leaderboard rows on entry and reveals cached rows before asking the server", async () => {
  const state = picker();
  const player = state.players.data.pages[0].players[0];
  const more = vi.fn();
  picker.mockReturnValue({
    ...state,
    players: {
      ...state.players,
      isFetching: false,
      fetchNextPage: more,
      data: {
        pages: Array.from({ length: 40 }, (_, page) => ({
          players: Array.from({ length: 25 }, (_, index) => ({
            ...player,
            userId: `player-${page}-${index}`,
            username: `player-${page}-${index}`,
          })),
        })),
      },
    },
  });
  const view = renderWithI18n(<Leaderboard groupId="test" />);
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Azul" }));
  expect(screen.getAllByRole("row")).toHaveLength(26);
  expect(screen.queryByText("@player-1-0")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Load more$/ }));
  expect(screen.getAllByRole("row")).toHaveLength(51);
  expect(more).not.toHaveBeenCalled();
  view.unmount();
  renderWithI18n(<Leaderboard groupId="test" />);
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Azul" }));
  expect(screen.getAllByRole("row")).toHaveLength(26);
});

it("keeps the selected game label when closing search restores an option window that excludes it", async () => {
  const state = picker();
  picker.mockImplementation((args: { gameId: number | null }) => ({
    ...state,
    games: {
      ...state.games,
      data: { games: args.gameId === 2 ? [games[0]] : games },
      selectedGame: args.gameId === 2 ? games[1] : undefined,
    },
  }));
  renderWithI18n(<Leaderboard groupId="test" />);
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Cascadia" }));
  const selected = screen.getByRole("button", { name: /Cascadia Board game/ });
  expect(selected.querySelector('[data-slot="selected-game-name"]')?.textContent?.trim()).toBe(
    "Cascadia",
  );
  expect(screen.queryByText("Unknown")).toBeNull();
});

it.each([false, true])(
  "expands compact player statistics and applies the row spacing for global=%s",
  async (global) => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      media: query,
      matches: query === "(max-width: 639px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    try {
      renderWithI18n(<Leaderboard groupId={global ? undefined : "test"} groupName="Game night" />);
      expect(screen.getByText("Choose a game to see the leaderboard")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
      fireEvent.click(await screen.findByRole("option", { name: "Azul" }));
      const list = screen.getByRole("list", {
        name: global ? "Global leaderboard" : "Group leaderboard",
      });
      const card = within(list).getByTestId("group-ranking-player-former");
      expect(within(card).getByText("@grace")).toBeVisible();
      expect(within(card).getByText("Former group member")).toBeVisible();
      expect(within(card).getByText("OpenSkill")).toBeVisible();
      const row = within(card);
      const position = row.getByRole("img", { name: "Position: #4" });
      expect(position).toHaveTextContent("#4");
      expect(position.compareDocumentPosition(row.getByText("@grace"))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      const statistics = row.getByRole("button", { name: /Game statistics: @grace/ });
      expect(statistics).toHaveAttribute("aria-expanded", "false");
      expect(position.closest(".ps-4")).toHaveClass("py-3", "pe-3");
      for (const label of ["Played", "Wins", "ND"]) expect(row.queryByText(label)).toBeNull();
      fireEvent.click(statistics);
      expect(statistics).toHaveAttribute("aria-expanded", "true");
      for (const label of ["Played", "Wins", "ND"]) expect(row.getByText(label)).toBeVisible();
      expect(row.getByText("Wins").closest(".pb-3")).toHaveClass("ps-4");
      fireEvent.click(statistics);
      expect(statistics).toHaveAttribute("aria-expanded", "false");
      expect(row.queryByText("ND")).toBeNull();
      expect(screen.queryByRole("grid")).toBeNull();
      expect(screen.getByTestId("ranking-sort-metric")).toBeVisible();
      expect(screen.getByTestId("ranking-sort-direction")).toBeVisible();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it("changes both sort directions through the desktop table headers", async () => {
  renderWithI18n(<Leaderboard groupId="test" />);
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Azul" }));
  const rating = screen.getByRole("columnheader", { name: "OpenSkill" });
  expect(rating).toHaveAttribute("aria-sort", "descending");
  fireEvent.click(rating);
  expect(picker).toHaveBeenLastCalledWith(
    expect.objectContaining({ gameId: 1, sort: "rating", direction: "asc" }),
  );
  expect(rating).toHaveAttribute("aria-sort", "ascending");
  fireEvent.click(screen.getByRole("button", { name: "Sort descending" }));
  expect(rating).toHaveAttribute("aria-sort", "descending");
  const wins = screen.getByRole("columnheader", { name: "Wins" });
  fireEvent.click(wins);
  expect(picker).toHaveBeenLastCalledWith(expect.objectContaining({ gameId: 1, sort: "gamesWon" }));
  const order = wins.getAttribute("aria-sort");
  expect(["ascending", "descending"]).toContain(order);
  fireEvent.click(wins);
  expect(wins).toHaveAttribute("aria-sort", order === "ascending" ? "descending" : "ascending");
});

it("renders shared game results with static columns when the host does not expose sorting", () => {
  const onMore = vi.fn();
  renderWithI18n(
    <LeaderboardView
      gameId={games[0].id}
      players={{
        items: [
          {
            userId: "ada",
            name: "Ada",
            username: "ada",
            avatarUrl: null,
            position: 1,
            gamesPlayed: 5,
            gamesWon: 3,
            nd: 1,
            rating: 530,
            provisional: false,
          },
        ],
        isPending: false,
        isError: false,
        hasNextPage: true,
        isFetchingNextPage: false,
        onRetry: vi.fn(),
        onMore,
      }}
    />,
  );
  const table = within(screen.getByRole("grid", { name: "Rankings" }));
  expect(table.getByText("@ada")).toBeVisible();
  expect(table.getByRole("columnheader", { name: "Wins" })).toHaveTextContent("Wins");
  expect(table.getByRole("columnheader", { name: "Wins" })).not.toHaveAttribute("aria-sort");
  expect(screen.queryByRole("button", { name: /Board game/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(onMore).toHaveBeenCalledOnce();
});
