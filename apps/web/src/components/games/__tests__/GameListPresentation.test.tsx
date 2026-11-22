import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { renderWithI18n } from "@/test-utils";
import { GameListCard } from "../GameListCard";
import { GameListRow } from "../GameListRow";

it("renders a non-actionable game row and recovers an image only after its URL changes", () => {
  const view = renderWithI18n(
    <GameListCard name="Ark Nova" imageUrl="https://images.example/first.jpg" />,
  );
  expect(screen.getByRole("listitem")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  const image = view.container.querySelector("img");
  expect(image?.getAttribute("src")).toBe("https://images.example/first.jpg");
  if (!image) throw new Error("The supplied game image was not rendered");
  fireEvent.error(image);
  expect(view.container.querySelector("img")).toBeNull();
  expect(screen.getByText("Ark Nova")).toBeTruthy();
  view.rerender(<GameListCard name="Ark Nova" imageUrl="https://images.example/first.jpg" />);
  expect(view.container.querySelector("img")).toBeNull();
  view.rerender(<GameListCard name="Ark Nova" imageUrl="https://images.example/replacement.jpg" />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
    "https://images.example/replacement.jpg",
  );
});

const game = {
  id: 1,
  name: "Cascadia",
  imageUrl: null,
  year: 2021,
  average: 7.83,
  rank: 42,
  minPlayMinutes: 30,
  maxPlayMinutes: 45,
  averageWeight: 3.5,
  categories: ["Animals", "Puzzle"],
  suggestedPlayers: {
    totalVotes: 10,
    fetchedAt: "2026-11-14T00:00:00.000Z",
    rows: [4, 2, 3].map((players) => ({
      players,
      orMore: false,
      best: 8,
      recommended: 2,
      notRecommended: 0,
      sampleCount: 10,
    })),
  },
};
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.example.test",
    userId: "user",
    getToken: async () => "test",
  }),
}));
afterEach(() => vi.unstubAllGlobals());

it("shows BGG facts in the badge and keeps row actions separate", () => {
  const selected = vi.fn();
  const trailing = vi.fn();
  renderWithI18n(
    <GameListCard
      name={game.name}
      game={game}
      onPress={selected}
      titleAccessory={<span>Owned</span>}
      metadata={<span>Collection copy</span>}
      actions={
        <button type="button" onClick={trailing}>
          Remove game
        </button>
      }
    >
      <p>Suggested for tonight</p>
    </GameListCard>,
  );
  expect(screen.getByText("Owned")).toBeTruthy();
  expect(screen.getByText("Collection copy")).toBeTruthy();
  expect(screen.getByText("Suggested for tonight")).toBeTruthy();
  expect(screen.queryByText(/min$/)).toBeNull();
  expect(screen.queryByText("2021")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Game information: Cascadia" }));
  const popover = within(screen.getByRole("dialog", { name: "Cascadia" }));
  expect(popover.getByText("2021")).toBeTruthy();
  expect(popover.getByText("7.83")).toBeTruthy();
  expect(popover.getByText("#42")).toBeTruthy();
  expect(popover.getByText("30–45 min")).toBeTruthy();
  expect(popover.getByText("2 (80%) – 3 (80%)")).toBeTruthy();
  expect(popover.getByText("3.5/5")).toBeTruthy();
  for (const label of ["Year", "Duration", "Best BGG", "Difficulty"]) {
    const icon = popover.getByText(`${label}:`).closest("dt")?.querySelector("svg");
    expect(icon).toHaveClass("text-accent");
    expect(icon).toHaveAttribute("fill", "none");
  }
  expect(popover.getByText("Animals")).toBeTruthy();
  expect(popover.queryByText("60 minutes")).toBeNull();
  expect(selected).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Cascadia" }), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Remove game" }));
  expect(trailing).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Cascadia" }));
  expect(selected).toHaveBeenCalledOnce();
});

it.each([false, true])(
  "requests missing facts on first intersection (accordion=%s)",
  async (accordion) => {
    let seen: IntersectionObserverCallback | undefined;
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          seen = callback;
        }
        observe = observer.observe;
        disconnect = observer.disconnect;
      },
    );
    let reply: (value: Response) => void = () => {};
    const fetchApi = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          reply = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchApi);
    const props = { name: game.name, game: { ...game, average: undefined, categories: undefined } };
    renderWithI18n(
      <QueryClientProvider client={new QueryClient()}>
        {accordion ? (
          <GroupedList>
            <GameListRow
              {...props}
              disclosure={{
                label: "Vote summary: Cascadia",
                indicatorLabel: "Votes",
                content: "Vote tally",
              }}
            />
          </GroupedList>
        ) : (
          <GameListCard {...props} />
        )}
      </QueryClientProvider>,
    );
    expect(observer.observe).toHaveBeenCalledOnce();
    await act(() => {
      seen?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });
    expect(fetchApi).not.toHaveBeenCalled();
    expect(observer.disconnect).not.toHaveBeenCalled();
    await act(() => {
      seen?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });
    await waitFor(() => expect(fetchApi).toHaveBeenCalledOnce());
    if (accordion) {
      expect(screen.queryByRole("button", { name: "Game information: Cascadia" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Vote summary: Cascadia" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Game information: Cascadia" }));
    const popover = screen.getByRole("dialog", { name: "Cascadia" });
    expect(within(popover).getByText("2021")).toBeTruthy();
    expect(popover.querySelectorAll(".skeleton").length).toBe(2);
    reply(Response.json({ items: [game] }));
    expect(await within(popover).findByText("Animals")).toBeTruthy();
    expect(within(popover).getByText("7.83")).toBeTruthy();
    expect(popover.querySelector(".skeleton")).toBeNull();
  },
);
