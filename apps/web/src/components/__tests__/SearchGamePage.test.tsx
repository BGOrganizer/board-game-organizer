import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GameCatalogMetadata } from "@/components/GameCatalogMetadata";
import { SearchGamePage } from "@/components/SearchGamePage";
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
          },
          { id: 2, name: "Already selected", year: null, imageUrl: null },
        ],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 1,
        name: "Cascadia",
        imageUrl: null,
        year: 2021,
        average: 7.83,
        rank: 42,
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

  fireEvent.change(screen.getByPlaceholderText(/Search board games/i), {
    target: { value: "Cascadia" },
  });

  const searchChip = screen.getByRole("button", { name: "Search", pressed: true });
  expect(searchChip.className).toContain("h-7");
  expect(searchChip.querySelector(".text-white")).toBeTruthy();
  const select = await screen.findByRole("button", { name: "Select: Cascadia" });
  expect(select.closest("li")?.className).toContain("p-3 pl-4");
  expect(select.closest("ul")?.className).toContain("rounded-xl bg-surface");
  expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
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

  await waitFor(() =>
    expect(onSelect).toHaveBeenCalledWith({
      id: 1,
      name: "Cascadia",
      imageUrl: null,
      year: 2021,
      average: 7.83,
      rank: 42,
    }),
  );
});
