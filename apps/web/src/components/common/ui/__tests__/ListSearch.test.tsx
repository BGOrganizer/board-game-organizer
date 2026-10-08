import { useListSearch } from "@board-game-organizer/shared";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { Crown } from "lucide-react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { messages } from "../../../../../../../messages/en.js";
import { ListSearch } from "../ListSearch";

const available = ["admin", "requested"] as const;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("debounces trimmed searches, clears undersized input, and restores canonical filter order", () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useListSearch(available));
  expect(result.current.selected).toEqual(available);
  act(() => result.current.setQuery(" abc "));
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.search).toBe("");
  act(() => result.current.setQuery(" board "));
  act(() => vi.advanceTimersByTime(299));
  expect(result.current.search).toBe("");
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.search).toBe("board");
  act(() => result.current.setQuery(""));
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.search).toBe("");
  act(() => result.current.toggle("admin"));
  expect(result.current.selected).toEqual(["requested"]);
  act(() => result.current.toggle("admin"));
  expect(result.current.selected).toEqual(available);
  act(() => result.current.toggle("requested"));
  act(() => result.current.toggle("admin"));
  expect(result.current.selected).toEqual([]);
  unmount();
});

it("shares labeled search, help, conditional inline clear and compact selected icon filters", async () => {
  const change = vi.fn(),
    toggle = vi.fn();
  const props = {
    query: "",
    onQueryChange: change,
    label: "Search things",
    placeholder: "Find things",
    options: [{ key: "admin", label: "Admin", icon: Crown }],
    selected: ["admin"],
    onToggle: toggle,
  };
  const i18n = setupI18n({ locale: "en", messages: { en: messages } });
  const view = render(<ListSearch {...props} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n}>{children}</I18nProvider>
    ),
  });
  const input = screen.getByRole("searchbox", { name: "Search things" });
  expect(input.getAttribute("placeholder")).toBe("Find things");
  expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  expect(screen.getByRole("button", { name: "Admin" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Admin" }));
  expect(toggle).toHaveBeenCalledWith("admin");
  fireEvent.change(input, { target: { value: "abc" } });
  expect(change).toHaveBeenCalledWith("abc");
  fireEvent.click(screen.getByRole("button", { name: "Search things: Search help" }));
  expect(screen.getByText("Type at least 4 characters to search")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0]);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  view.rerender(<ListSearch {...props} query="abc" selected={[]} />);
  expect(screen.getByText("Enter at least 4 characters to search")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Admin" }).getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(change).toHaveBeenLastCalledWith("");
  view.rerender(<ListSearch {...props} query="board" options={[]} />);
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
  expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
  view.rerender(<ListSearch {...props} query=" " />);
  expect(screen.queryByText("Enter at least 4 characters to search")).toBeNull();
});
