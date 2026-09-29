import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { GroupLeaderboard } from "@/components/GroupLeaderboard";
import { renderWithI18n } from "@/test-utils";

const picker = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "admin", getToken: vi.fn() }),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useGroupLeaderboard: (args: unknown) => picker(args),
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
  renderWithI18n(<GroupLeaderboard groupId="test" />);
  expect(screen.getByText("No matches played in this group yet")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Board game/ })).toBeNull();
});

it("keeps load failures observable and retryable", () => {
  picker.mockReturnValueOnce({
    games: { isPending: false, isError: true, refetch: refresh },
    players: { data: undefined, hasNextPage: false },
  });
  renderWithI18n(<GroupLeaderboard groupId="test" />);
  fireEvent.click(screen.getByRole("button", { name: "Could not load leaderboards. Retry" }));
  expect(refresh).toHaveBeenCalledOnce();
});

it("filters by selected game and identifies provisional former members", async () => {
  renderWithI18n(<GroupLeaderboard groupId="test" />);
  expect(screen.queryByRole("grid")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  const azul = await screen.findByRole("option", { name: "Azul" });
  expect(azul.querySelector("img")?.getAttribute("src")).toBe(games[0].imageUrl);
  fireEvent.click(azul);
  expect(picker).toHaveBeenLastCalledWith(expect.objectContaining({ gameId: 1 }));
  expect(screen.getByRole("grid")).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "ND" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Ranking" })).toBeTruthy();
  const trigger = screen.getByRole("button", { name: /Azul Board game/ });
  expect(trigger.querySelector("img")).toBeTruthy();
  expect(trigger.querySelector('[data-slot="select-value"]')?.textContent).toBe("Azul");
  expect(trigger.parentElement?.parentElement).toBe(
    screen.getByRole("button", { name: "Clear board game selection" }).parentElement,
  );
  expect(screen.getByText("@grace")).toBeTruthy();
  expect(screen.getByText("Former group member")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Provisional rating" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Board game/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Cascadia" }));
  expect(picker).toHaveBeenLastCalledWith(expect.objectContaining({ gameId: 2 }));
  fireEvent.click(screen.getByRole("button", { name: "Clear board game selection" }));
  expect(picker).toHaveBeenLastCalledWith(expect.objectContaining({ gameId: null }));
  expect(screen.queryByRole("grid")).toBeNull();
});
