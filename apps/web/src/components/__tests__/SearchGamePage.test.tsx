import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SearchGamePage } from "@/components/SearchGamePage";
import { renderWithI18n } from "@/test-utils";

afterEach(() => vi.unstubAllGlobals());

it("hides selected games and uses an icon-only selection action", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 1,
            name: "Cascadia",
            year: 2021,
            imageUrl: "https://cf.geekdo-images.com/a/thumb.jpg",
          },
          { id: 2, name: "Already selected", year: null, imageUrl: null },
        ],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1, name: "Cascadia", imageUrl: null, year: 2021 }),
    });
  vi.stubGlobal("fetch", fetchMock);
  const onSelect = vi.fn();

  renderWithI18n(
    <SearchGamePage
      apiUrl="https://api.example.com"
      token="token"
      excludeIds={[2]}
      onSelect={onSelect}
      onClose={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByPlaceholderText(/Search board games/i), {
    target: { value: "Cascadia" },
  });

  const select = await screen.findByRole("button", { name: "Select: Cascadia" });
  expect(screen.queryByText("Already selected")).toBeNull();
  expect(screen.queryByText("Select")).toBeNull();
  expect(screen.getByText("2021")).toBeTruthy();
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
    }),
  );
});
