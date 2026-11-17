import { describe, expect, it } from "vitest";
import { stableTabContentWidth } from "../tabBarGeometry";

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
