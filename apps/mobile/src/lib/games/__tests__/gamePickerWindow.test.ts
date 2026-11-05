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
    "exposes only eight source items on entry with %s cached pages, without reading hidden items",
    (count) => {
      const first = Array.from({ length: 25 }, (_, i) => item(i));
      for (let i = 8; i < first.length; i++)
        Object.defineProperty(first, i, {
          get() {
            throw new Error("Hidden items must not be inspected");
          },
        });
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
      expect(window.items).toEqual(first.slice(0, 8));
      expect(window.items[0]).toBe(first[0]);
      expect(window.hasCachedMore).toBe(true);
      expect(pages).toHaveLength(count);
    },
  );
  it("reveals bounded chunks within and across cached pages, preserving every record and cursor", () => {
    const pages = [0, 1].map((p) =>
      Object.freeze({
        items: Object.freeze(Array.from({ length: 25 }, (_, i) => item(p * 25 + i))),
        nextCursor: `cursor-${p}`,
      }),
    );
    for (const [chunks, count] of [
      [1, 8],
      [2, 16],
      [3, 24],
      [4, 25],
      [5, 33],
      [6, 41],
      [7, 49],
      [8, 50],
      [9, 50],
    ]) {
      const window = gamePickerWindow(pages, chunks, none);
      expect(window.items.map((row) => row.id)).toEqual(Array.from({ length: count }, (_, i) => i));
      expect(window.hasCachedMore).toBe(count < 50);
      expect(
        window.items.every((row) => row === pages[Math.floor(row.id / 25)].items[row.id % 25]),
      ).toBe(true);
    }
    expect(pages.map((page) => page.nextCursor)).toEqual(["cursor-0", "cursor-1"]);
  });
  it("consumes empty pages as bounded work and never scans later pages on initial entry", () => {
    const pages = [
      { items: [] },
      {
        get items(): BggPickerItem[] {
          throw new Error("Hidden empty-page successor read");
        },
      },
    ];
    expect(gamePickerWindow(pages, 1, none)).toEqual({ items: [], hasCachedMore: true });
    expect(gamePickerWindow([{ items: [] }, { items: [item(1)] }], 2, none)).toEqual({
      items: [item(1)],
      hasCachedMore: false,
    });
    expect(gamePickerWindow([{ items: [] }], 1, none)).toEqual({ items: [], hasCachedMore: false });
  });
  it("does not expand initial source work to compensate for excluded items", () => {
    const first = Array.from({ length: 25 }, (_, i) => item(i));
    expect(
      gamePickerWindow([{ items: first }], 1, new Set(first.slice(0, 8).map((row) => row.id))),
    ).toEqual({ items: [], hasCachedMore: true });
    expect(
      gamePickerWindow([{ items: first }], 2, new Set(first.slice(0, 8).map((row) => row.id))),
    ).toEqual({ items: first.slice(8, 16), hasCachedMore: true });
    expect(gamePickerWindow([{ items: first }], 4, new Set(first.map((row) => row.id)))).toEqual({
      items: [],
      hasCachedMore: false,
    });
  });
  it("retains the explicit load-more path through excluded pages", () => {
    const pages = [{ items: [item(1)] }, { items: [item(2)] }];
    expect(gamePickerWindow(pages, 1, new Set([1]))).toEqual({ items: [], hasCachedMore: true });
    expect(gamePickerWindow(pages, 2, new Set([1]))).toEqual({
      items: [pages[1].items[0]],
      hasCachedMore: false,
    });
  });
  it.each([0, -1])("does not expose source items before a positive chunk budget: %s", (chunks) => {
    expect(gamePickerWindow([{ items: [item(1)] }], chunks, none)).toEqual({
      items: [],
      hasCachedMore: true,
    });
  });
  it.each([undefined, []])("handles an uncached/loading or truly empty result: %j", (pages) => {
    expect(gamePickerWindow(pages, 1, none)).toEqual({ items: [], hasCachedMore: false });
  });
});
