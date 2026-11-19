import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";
import { resourceArtworkFrames } from "../resourceArtworkFrames";
import { type ArtworkPlacement, artworkLayerTransform } from "../resourceArtworkLayers";
import {
  ARTWORK_CYCLE_MS,
  type ArtworkMotion,
  interpolateArtworkMotion,
  resourceArtworkMotion,
} from "../resourceArtworkMotion";

// Load the installed pure Bezier implementation, without loading React Native's Flow modules.
const require = createRequire(import.meta.url);
const bezier = {} as {
  Bezier(a: number, b: number, c: number, d: number): (value: number) => number;
};
runInNewContext(
  ts.transpileModule(
    readFileSync(require.resolve("react-native-reanimated/src/Bezier.ts"), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText,
  { exports: bezier },
);
const ease = bezier.Bezier(0.42, 0, 0.58, 1);
const placements: Array<[string, string | undefined, ArtworkPlacement[]]> = [
  ["bgo-events-calendar", undefined, [{ x: 0, y: 0, scale: 1 }]],
  ...["bunting", "flag", "stars"].map((celebration): [string, string, ArtworkPlacement[]] => [
    "bgo-events-banner",
    celebration,
    [{ x: 0, y: 0, scale: 1 }],
  ]),
  [
    "bgo-events-accessory",
    undefined,
    [
      { x: 179, y: 162, scale: 1 },
      { x: 178, y: 168, scale: 1 },
      { x: 183, y: 162, scale: 1.05 },
    ],
  ],
  ["bgo-tables-die", undefined, [{ x: 148, y: 151, scale: 0.72 }]],
  [
    "bgo-tables-token",
    undefined,
    [
      { x: 146, y: 151, scale: 1 },
      { x: 148, y: 150, scale: 0.63 },
    ],
  ],
  [
    "bgo-groups-member-0",
    undefined,
    [
      { x: 120, y: 114, scale: 1 },
      { x: 120, y: 85, scale: 0.8 },
      { x: 120, y: 83, scale: 0.85 },
    ],
  ],
  [
    "bgo-groups-member-1",
    undefined,
    [
      { x: 74, y: 132, scale: 0.73 },
      { x: 89, y: 137, scale: 0.8 },
      { x: 78, y: 132, scale: 0.8 },
    ],
  ],
  [
    "bgo-groups-member-2",
    undefined,
    [
      { x: 166, y: 132, scale: 0.73 },
      { x: 151, y: 137, scale: 0.8 },
      { x: 162, y: 132, scale: 0.8 },
    ],
  ],
  [
    "bgo-groups-badge",
    undefined,
    [
      { x: 0, y: 0, scale: 1 },
      { x: 120, y: 183, scale: 1 },
      { x: 120, y: 180, scale: 0.45 },
    ],
  ],
];
const sizes = [40, 64, 96, 390, 640];

it("matches every original matrix, phase, pivot and alpha at all native timing frames", () => {
  for (const [name, celebration, positions] of placements) {
    const motion = resourceArtworkMotion(name, celebration) as ArtworkMotion;
    for (const position of positions)
      for (const size of sizes) {
        const frames = resourceArtworkFrames(motion, position, size, ease);
        expect(frames.inputRange).toHaveLength(Math.round(ARTWORK_CYCLE_MS / (1000 / 60)) + 1);
        expect(frames.inputRange[0]).toBe(0);
        expect(frames.inputRange.at(-1)).toBe(1);
        const exact = frames.inputRange.map((progress) => {
          const state = interpolateArtworkMotion(motion, progress, ease, true);
          const matrix = artworkLayerTransform(state.matrix, position, size / 240);
          return {
            x: matrix[12],
            y: matrix[13],
            rotation: `${Math.atan2(matrix[1], matrix[0])}rad`,
            opacity: state.opacity,
          };
        });
        expect(frames.translateX).toEqual(exact.map((sample) => sample.x));
        expect(frames.translateY).toEqual(exact.map((sample) => sample.y));
        expect(frames.rotate).toEqual(exact.map((sample) => sample.rotation));
        expect(frames.opacity).toEqual(exact.map((sample) => sample.opacity));
      }
  }
});

it("keeps intermediate interpolation below one physical pixel at DPR3.5", () => {
  const maxima: Record<string, number> = {};
  let alphaMaximum = 0;
  for (const [name, celebration, positions] of placements) {
    const motion = resourceArtworkMotion(name, celebration) as ArtworkMotion;
    for (const position of positions)
      for (const size of sizes) {
        const frames = resourceArtworkFrames(motion, position, size, ease);
        let maximum = 0;
        const rotations = frames.rotate.map(Number.parseFloat);
        for (let index = 0; index < frames.inputRange.length - 1; index++) {
          for (const fraction of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
            const progress = (index + fraction) / (frames.inputRange.length - 1);
            const exact = interpolateArtworkMotion(motion, progress, ease, true);
            const matrix = artworkLayerTransform(exact.matrix, position, size / 240);
            const interpolate = (values: number[]) =>
              values[index] + (values[index + 1] - values[index]) * fraction;
            const angle = interpolate(rotations);
            const cos = Math.cos(angle),
              sin = Math.sin(angle);
            const tx = interpolate(frames.translateX),
              ty = interpolate(frames.translateY);
            // The full plane corners bound every approved internal shape, including strokes.
            for (const [x, y] of [
              [0, 0],
              [size, 0],
              [0, size],
              [size, size],
            ]) {
              maximum = Math.max(
                maximum,
                Math.hypot(
                  cos * x - sin * y + tx - (matrix[0] * x + matrix[4] * y + matrix[12]),
                  sin * x + cos * y + ty - (matrix[1] * x + matrix[5] * y + matrix[13]),
                ) * 3.5,
              );
            }
            alphaMaximum = Math.max(
              alphaMaximum,
              Math.abs(interpolate(frames.opacity) - exact.opacity),
            );
          }
        }
        maxima[`${name}:${celebration}:${size}`] = Math.max(
          maxima[`${name}:${celebration}:${size}`] ?? 0,
          maximum,
        );
      }
  }
  expect(Math.max(...Object.values(maxima))).toBeLessThan(1);
  expect(alphaMaximum).toBeLessThan(0.0001);
}, 30_000); // Exhaustive geometry matrix also runs instrumented for coverage on the Raspberry.

it("retains every stagger and loop seam, and yields zero translation for an unmeasured plane", () => {
  for (const [name, celebration, positions] of placements) {
    const motion = resourceArtworkMotion(name, celebration) as ArtworkMotion;
    const frames = resourceArtworkFrames(motion, positions[0], 0, ease);
    expect(frames.translateX.every((value) => value === 0)).toBe(true);
    expect(frames.translateY.every((value) => value === 0)).toBe(true);
    expect(frames.rotate[0]).toBe(frames.rotate.at(-1));
    expect(frames.opacity[0]).toBe(frames.opacity.at(-1));
  }
});
