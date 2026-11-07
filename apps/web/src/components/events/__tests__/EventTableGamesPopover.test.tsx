import { fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableCard } from "../EventTableCard";
import { EventTableGamesPopover } from "../EventTableGamesPopover";

vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "owner" }) }));
afterEach(() => vi.unstubAllGlobals());

it.each(["personal", "event"] as const)(
  "opens approved games from %s cards without navigating, fetching or exposing votes",
  async (context) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderWithI18n(
      <EventTableCard
        context={context}
        table={{
          ...plannedTable,
          gamesDetail: [
            {
              ...plannedTable.gamesDetail[0],
              imageUrl: "https://example.test/cover.png",
              year: 2024,
              average: 8.2,
              rank: 12,
            },
          ],
        }}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Board games: First table" });
    expect(trigger.closest("a")).toBeNull();
    const navigation = vi.fn();
    screen.getByRole("link").addEventListener("click", navigation);
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Chess");
    expect(dialog.textContent).toContain("2024");
    expect(dialog.textContent).toContain("8.2");
    expect(dialog.querySelector('img[src="https://example.test/cover.png"]')).not.toBeNull();
    expect(screen.queryByLabelText("Votes: Chess")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Chess:/ })).toBeNull();
    expect(navigation).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("shows only the frozen game after confirmation, never planning alternatives or provisional votes", async () => {
  renderWithI18n(
    <EventTableCard
      table={{
        ...plannedTable,
        eventStatus: "CONFIRMED",
        confirmed: { gameId: 1, playerIds: ["owner"], startsAt: "2030-01-01T18:00:00Z" },
        gamesDetail: [
          ...plannedTable.gamesDetail,
          { ...plannedTable.gamesDetail[0], id: 2, name: "Planning alternative" },
        ],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Board games: First table" }));
  await screen.findByRole("dialog");
  expect(screen.queryByText("Planning alternative")).toBeNull();
  expect(screen.queryByLabelText("Votes: Chess")).toBeNull();
});
it("bounds large cached game collections to local eight-row pages with no data request", async () => {
  const games = Array.from({ length: 11 }, (_, index) => ({
    ...plannedTable.gamesDetail[0],
    id: index + 1,
    name: `Game ${index + 1}`,
    year: null,
    average: null,
    rank: null,
    imageUrl: null,
  }));
  const view = renderWithI18n(<EventTableGamesPopover games={games} name="Large table" />);
  fireEvent.click(screen.getByRole("button", { name: "Board games: Large table" }));
  await screen.findByRole("dialog");
  expect(screen.getByText("Game 8")).not.toBeNull();
  expect(screen.queryByText("Game 9")).toBeNull();
  const previous = screen.getByRole("button", { name: "Previous page" });
  const next = screen.getByRole("button", { name: "Next page" });
  expect(previous.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(previous);
  expect(screen.getByText("Game 1")).not.toBeNull();
  next.focus();
  fireEvent.click(next);
  expect(next.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(next);
  fireEvent.click(next);
  expect(screen.getByText("Game 11")).not.toBeNull();
  expect(screen.queryByText("Game 1")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  expect(screen.getByText("Game 1")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  view.rerender(<EventTableGamesPopover games={games.slice(0, 1)} name="Large table" />);
  expect(screen.getByText("Game 1")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
});
it("keeps absent metadata and an empty supplied list explicit, without fabricated counts", async () => {
  renderWithI18n(<EventTableGamesPopover games={[]} name="Empty table" />);
  fireEvent.click(screen.getByRole("button", { name: "Board games: Empty table" }));
  expect(await screen.findByText("No games found")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  expect(screen.queryByText("0")).toBeNull();
});
