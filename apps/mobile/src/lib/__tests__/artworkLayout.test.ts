import { expect, it } from "vitest";
import { containedArtwork } from "../artworkLayout";

it.each([
  [100, 80, 2, 0, 100, 50],
  [100, 80, 0.5, 0, 40, 80],
  [100, 80, 2, 4, 92, 46],
  [100, 80, 2, -4, 100, 50],
  [0, 80, 2, 0, 0, 0],
  [100, -1, 2, 0, 0, 0],
])(
  "fits actual artwork without stretching or negative dimensions: %s/%s/%s/%s",
  (width, height, ratio, inset, expectedWidth, expectedHeight) => {
    expect(containedArtwork(width, height, ratio, inset)).toEqual({
      width: expectedWidth,
      height: expectedHeight,
    });
  },
);
it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  "uses a safe square until a valid image ratio is known: %s",
  (ratio) => {
    expect(containedArtwork(100, 80, ratio)).toEqual({ width: 80, height: 80 });
  },
);
