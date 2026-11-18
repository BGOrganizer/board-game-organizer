import { useBggCollectionFilters } from "@board-game-organizer/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";

it("derives all game/expansion combinations and treats wishlist as an explicit independent source", () => {
  const h = renderHook(() => useBggCollectionFilters("viewer-snapshot"));
  expect(h.result.current.selected).toEqual(["games", "expansions"]);
  expect(h.result.current.types).toBe("all");
  act(() => h.result.current.toggle("expansions"));
  expect(h.result.current.types).toBe("games");
  act(() => h.result.current.toggle("games"));
  expect(h.result.current.types).toBe("none");
  act(() => h.result.current.toggle("expansions"));
  expect(h.result.current.types).toBe("expansions");
  act(() => h.result.current.toggle("wishlist"));
  expect(h.result.current.types).toBe("all");
  expect(h.result.current.wishlist).toBe(true);
  act(() => h.result.current.toggle("wishlist"));
  expect(h.result.current.types).toBe("expansions");
  expect(h.result.current.wishlist).toBe(false);
  act(() => h.result.current.toggle("games"));
  expect(h.result.current.selected).toEqual(["expansions", "games"]);
  expect(h.result.current.types).toBe("all");
});

it("never exposes or enables common-source filtering without the viewer's actual snapshot and preserves its unsaved selection when restored", () => {
  const h = renderHook(({ snapshot }) => useBggCollectionFilters(snapshot), {
    initialProps: { snapshot: undefined as string | undefined },
  });
  act(() => h.result.current.toggle("common"));
  expect(h.result.current.selected).toEqual(["games", "expansions"]);
  expect(h.result.current.commonSnapshot).toBeUndefined();
  h.rerender({ snapshot: "first-snapshot" });
  act(() => h.result.current.toggle("common"));
  expect(h.result.current.selected).toContain("common");
  expect(h.result.current.commonSnapshot).toBe("first-snapshot");
  h.rerender({ snapshot: undefined });
  expect(h.result.current.selected).not.toContain("common");
  expect(h.result.current.commonSnapshot).toBeUndefined();
  act(() => h.result.current.toggle("common"));
  h.rerender({ snapshot: "second-snapshot" });
  expect(h.result.current.commonSnapshot).toBe("second-snapshot");
  expect(h.result.current.selected).toContain("common");
  act(() => h.result.current.toggle("common"));
  expect(h.result.current.commonSnapshot).toBeUndefined();
});

it("debounces and trims collection text while keeping the public draft and independent filter choices intact", async () => {
  const h = renderHook(() => useBggCollectionFilters("snapshot"));
  act(() => {
    h.result.current.setQuery("  A  ");
    h.result.current.toggle("common");
  });
  expect(h.result.current.query).toBe("  A  ");
  expect(h.result.current.search).toBe("");
  await waitFor(() => expect(h.result.current.search).toBe("A"));
  expect(h.result.current.commonSnapshot).toBe("snapshot");
  act(() => h.result.current.setQuery(""));
  await waitFor(() => expect(h.result.current.search).toBe(""));
  expect(h.result.current.selected).toEqual(["games", "expansions", "common"]);
});
