import { describe, expect, it } from "vitest";
import { windowedListLayout, windowedListViewport } from "../windowed-list";

it.each([
  [600, undefined, undefined, { top: 0, height: 600 }],
  [600, 50, 400, { top: 50, height: 400 }],
  [600, -50, 400, { top: 0, height: 350 }],
  [600, 450, 400, { top: 450, height: 150 }],
  [600, 700, 400, { top: 600, height: 0 }],
  [600, -500, 400, { top: 0, height: 0 }],
  [600, 50, 0, { top: 50, height: 0 }],
])("clips the actual scroll viewport to the browser: %s/%s/%s", (height, top, size, expected) => {
  expect(windowedListViewport(height, top, size)).toEqual(expected);
});

describe("document list geometry", () => {
  it("has no phantom gap or rows for an empty result", () => {
    expect(windowedListLayout([], new Map(), 76, 8, 0, 600)).toEqual({
      offsets: [],
      start: 0,
      end: 0,
      total: 0,
    });
  });
  it("keeps a bounded initial DOM window while reserving the complete scroll height", () => {
    const keys = Array.from({ length: 1000 }, (_, index) => String(index));
    const layout = windowedListLayout(keys, new Map(), 76, 8, 0, 600);
    expect(layout.offsets.slice(0, 3)).toEqual([0, 84, 168]);
    expect(layout.total).toBe(83992);
    expect(layout.start).toBe(0);
    expect(layout.end).toBe(12);
    expect(layout.end - layout.start).toBeLessThan(30);
  });
  it("measures variable rows, includes boundary rows and reveals later windows", () => {
    const keys = ["a", "b", "c", "d"];
    const measured = new Map([
      ["a", 40],
      ["b", 120],
    ]);
    const layout = windowedListLayout(keys, measured, 60, 10, 170, 30, 0);
    expect(layout).toEqual({ offsets: [0, 50, 180, 250], start: 1, end: 3, total: 310 });
    expect(windowedListLayout(keys, measured, 60, 10, 400, 50, 0)).toMatchObject({
      start: 4,
      end: 4,
    });
    expect(windowedListLayout(keys, measured, 60, 10, -200, 50, 0)).toMatchObject({
      start: 0,
      end: 1,
    });
  });
});
