import { describe, expect, it } from "vitest";
import { revealedTabOffset, stableTabContentWidth } from "../tabBarGeometry";

describe("native tab content measurement", () => {
  it("settles the measured Samsung/Fabric one-pixel oscillation", () => {
    const widths = [316.1904602050781, 316.5714416503906];
    let width = stableTabContentWidth(0, widths[0], 2.625);
    let updates = 0;
    for (let index = 0; index < 1_000; index++) {
      const next = stableTabContentWidth(width, widths[index % 2], 2.625);
      if (next !== width) updates++;
      width = next;
    }
    expect(updates).toBe(0);
    expect(width).toBe(widths[0]);
  });

  it.each([1, 1.5, 2, 2.625, 3, 3.5])("uses physical pixels at density %s", (density) => {
    const previous = 800 / density;
    expect(stableTabContentWidth(previous, previous, density)).toBe(previous);
    expect(stableTabContentWidth(previous, 801 / density, density)).toBe(previous);
    expect(stableTabContentWidth(previous, 799 / density, density)).toBe(previous);
    expect(stableTabContentWidth(previous, 802 / density, density)).toBe(802 / density);
    expect(stableTabContentWidth(previous, 798 / density, density)).toBe(798 / density);
  });

  it("keeps real content, font, locale and viewport size changes responsive", () => {
    let width = 0;
    for (const measured of [316.1904602050781, 420, 275, 0, 390]) {
      width = stableTabContentWidth(width, measured, 2.625);
      expect(width).toBe(measured);
    }
  });
});

describe("selected tab visibility", () => {
  it.each([
    [0, 180, 100, 320, 500, 0],
    [80, 180, 100, 320, 500, 80],
    [180, 180, 100, 320, 500, 180],
    [180, 30, 100, 320, 500, 30],
    [0, 350, 100, 320, 500, 130],
    [0, 470, 30, 320, 500, 180],
    [0, 20, 600, 320, 900, 20],
    [0, 0, 600, 320, 900, 0],
    [-30, 0, 100, 320, 500, 0],
    [900, 350, 100, 320, 500, 180],
    [0, -20, 100, 320, 500, 0],
    [0, 0, 100, 320, 100, 0],
    [120, 180, 100, 0, 500, 120],
    [120, 180, 0, 320, 500, 120],
    [120, 180, 100, 320, 0, 120],
  ])(
    "reveals %s/%s/%s/%s/%s at %s without recentering visible labels",
    (offset, x, width, viewport, content, expected) => {
      expect(revealedTabOffset(offset, x, width, viewport, content)).toBe(expected);
    },
  );
});
