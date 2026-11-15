import { describe, expect, it, vi } from "vitest";
import { nextUserPage, type UserPage } from "../user-list";

const page = (overrides: Partial<UserPage> = {}): UserPage => ({
  isLoading: false,
  isError: false,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
  ...overrides,
});

describe("ordered user-list pagination", () => {
  it("does nothing after exhaustion, including an empty source list", () => {
    expect(nextUserPage([])).toBeUndefined();
    expect(nextUserPage([page(), page()])).toBeUndefined();
  });
  it("selects only the first unfinished source, then the next after exhaustion", () => {
    const first = page({ hasNextPage: true });
    const second = page({ hasNextPage: true });
    expect(nextUserPage([first, second])).toBe(first);
    nextUserPage([first, second])?.fetchNextPage();
    expect(first.fetchNextPage).toHaveBeenCalledOnce();
    expect(second.fetchNextPage).not.toHaveBeenCalled();
    first.hasNextPage = false;
    expect(nextUserPage([first, second])).toBe(second);
  });
  it.each([{ isLoading: true }, { isError: true }])(
    "blocks automatic loading when any source is unavailable: %j",
    (state) => {
      const first = page({ hasNextPage: true });
      expect(nextUserPage([first, page(state)])).toBeUndefined();
      expect(first.fetchNextPage).not.toHaveBeenCalled();
    },
  );
  it.each([{ isFetchingNextPage: true }, { isFetchNextPageError: true }])(
    "does not repeat a pending or failed page, or skip to a later source: %j",
    (state) => {
      const first = page({ hasNextPage: true, ...state });
      expect(nextUserPage([first, page({ hasNextPage: true })])).toBeUndefined();
      expect(first.fetchNextPage).not.toHaveBeenCalled();
    },
  );
});
