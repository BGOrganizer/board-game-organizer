import type { BggPickerItem } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { gamePickerWindow } from "../gamePickerWindow";

const item = (id: number): BggPickerItem => ({
  id,
  name: `Game ${id}`,
  imageUrl: null,
  year: null,
  source: "collection",
});
const none = new Set<number>();

describe("native game picker presentation window", () => {
  it.each([1, 10, 40])(
    "exposes only the first cached page on entry with %s pages, without touching later items",
    (count) => {
      const first = Array.from({ length: 25 }, (_, i) => item(i));
      const pages = Array.from({ length: count }, (_, i) =>
        i === 0
          ? { items: first }
          : {
              get items(): BggPickerItem[] {
                throw new Error("Hidden pages must not be flattened");
              },
            },
      );
      const window = gamePickerWindow(pages, 1, none);
      expect(window.items).toEqual(first);
      expect(window.items[0]).toBe(first[0]);
      expect(window.hasCachedMore).toBe(count > 1);
      expect(pages).toHaveLength(count);
    },
  );
  it("reveals cached pages in order without mutating records or source cursors", () => {
    const pages = [0, 1, 2].map((i) =>
      Object.freeze({ items: Object.freeze([item(i)]), nextCursor: `cursor-${i}` }),
    );
    for (const count of [1, 2, 3, 4]) {
      const window = gamePickerWindow(pages, count, none);
      expect(window.items.map((i) => i.id)).toEqual([0, 1, 2].slice(0, count));
      expect(window.hasCachedMore).toBe(count < pages.length);
    }
    expect(pages.map((p) => p.nextCursor)).toEqual(["cursor-0", "cursor-1", "cursor-2"]);
  });
  it("does not confuse an excluded/empty visible page with the end of cached results", () => {
    const pages = [{ items: [item(1)] }, { items: [item(2)] }];
    expect(gamePickerWindow(pages, 1, new Set([1]))).toEqual({ items: [], hasCachedMore: true });
    expect(gamePickerWindow(pages, 2, new Set([1]))).toEqual({
      items: [pages[1].items[0]],
      hasCachedMore: false,
    });
    expect(gamePickerWindow(pages, 2, new Set([1, 2]))).toEqual({
      items: [],
      hasCachedMore: false,
    });
  });
  it.each([undefined, []])("handles an uncached/loading or truly empty result: %j", (pages) => {
    expect(gamePickerWindow(pages, 1, none)).toEqual({ items: [], hasCachedMore: false });
  });
});
