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
          { id: 1, name: "Cascadia" },
          { id: 2, name: "Already selected" },
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
