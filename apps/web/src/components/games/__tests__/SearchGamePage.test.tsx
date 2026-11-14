import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GameCatalogMetadata } from "@/components/games/GameCatalogMetadata";
import { SearchGamePage } from "@/components/games/SearchGamePage";
import { renderWithI18n } from "@/test-utils";

afterEach(() => vi.unstubAllGlobals());

it("shows unranked games and zero arithmetic average without a Bayesian fallback", () => {
  renderWithI18n(<GameCatalogMetadata average={0} rank={0} />);
  expect(screen.getByRole("img", { name: "Average: 0.00" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Rank: Unranked" })).toBeTruthy();
});

it("hides selected games and uses an icon-only selection action", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ active: null, pending: null }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        nextCursor: null,
        items: [
          {
            id: 1,
            name: "Cascadia",
            year: 2021,
            average: 7.83,
            rank: 42,
            imageUrl: "https://cf.geekdo-images.com/a/thumb.jpg",
            source: "search",
            minPlayMinutes: 60,
            maxPlayMinutes: 90,
          },
          { id: 2, name: "Already selected", year: null, imageUrl: null },
        ],
      }),
    });
  vi.stubGlobal("fetch", fetchMock);
  const onSelect = vi.fn();

  renderWithI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SearchGamePage
        apiUrl="https://api.example.com"
        token="token"
        userId="user"
        excludeIds={[2]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );

  const input = screen.getByPlaceholderText(/Search board games/i);
  input.focus();
  fireEvent.change(input, {
    target: { value: "Cascadia" },
  });

  expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Participants' collections" })).toBeNull();
  const select = await screen.findByRole("option", { name: "Select: Cascadia" });
  expect(screen.getByPlaceholderText(/Search board games/i)).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(screen.getByRole("listbox", { name: "Board games" }).contains(select)).toBe(true);
  expect(select.querySelector(".lucide-plus")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Load more games" })).toBeNull();
  expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
  expect(screen.queryByText("Already selected")).toBeNull();
  expect(screen.queryByText("Select")).toBeNull();
  expect(screen.getByText("2021")).toBeTruthy();
  expect(
    screen.getByRole("img", { name: "Average: 7.83" }).querySelector("svg")?.getAttribute("class"),
  ).toContain("fill-warning");
  expect(screen.getByRole("img", { name: "Rank: 42" })).toBeTruthy();
  expect(document.querySelector("img")?.getAttribute("src")).toBe(
    "https://cf.geekdo-images.com/a/thumb.jpg",
  );
  fireEvent.click(select);

  expect(onSelect).toHaveBeenCalledWith({
    id: 1,
    name: "Cascadia",
    imageUrl: "https://cf.geekdo-images.com/a/thumb.jpg",
    year: 2021,
    average: 7.83,
    rank: 42,
    source: "search",
    minPlayMinutes: 60,
    maxPlayMinutes: 90,
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  fireEvent.click(select);
  expect(onSelect).toHaveBeenCalledTimes(1);
});
