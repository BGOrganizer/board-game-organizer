import { resourceArtworkDefinitions } from "@board-game-organizer/shared/artwork";
import { expect, it, vi } from "vitest";
import {
  ARTWORK_CYCLE_MS,
  interpolateArtworkMotion,
  resourceArtworkMotion,
} from "../resourceArtworkMotion";

const linear = (value: number) => value;
const names = [
  "bgo-events-calendar",
  "bgo-events-banner",
  "bgo-events-accessory",
  "bgo-tables-die",
  "bgo-tables-token",
  "bgo-groups-member-0",
  "bgo-groups-member-1",
  "bgo-groups-member-2",
  "bgo-groups-badge",
];

it("uses the exact medium speed and named groups from the approved SVG definitions", () => {
  expect(ARTWORK_CYCLE_MS).toBe(4800);
  for (const definition of Object.values(resourceArtworkDefinitions)) {
    const text = JSON.stringify(definition);
    expect(text).toContain("4.8s ease-in-out infinite");
    for (const name of names.filter((name) => text.includes(name)))
      expect(resourceArtworkMotion(name, "bunting")).toBeDefined();
  }
  expect(resourceArtworkMotion("unknown")).toBeUndefined();
  expect(resourceArtworkMotion("bgo-events-banner")).toBeUndefined();
  expect(resourceArtworkMotion("bgo-events-banner", "constructor")).toBeUndefined();
});

it.each([
  ["bunting", [105, 26]],
  ["flag", [179, 34]],
  ["stars", [170, 35]],
] as const)("preserves the approved %s banner's fill-box origin", (variant, origin) => {
  expect(resourceArtworkMotion("bgo-events-banner", variant)?.origin).toEqual(origin);
});

it.each(names)("resets %s to the unanimated SVG when motion is disabled", (name) => {
  const easing = vi.fn(linear);
  const profile = resourceArtworkMotion(name, "bunting")!;
  expect(interpolateArtworkMotion(profile, 0.37, easing, false)).toEqual({
    matrix: [1, 0, 0, 1, 0, 0],
    opacity: 1,
  });
  expect(easing).not.toHaveBeenCalled();
});

it("sways the calendar around its fixed SVG pivot without changing proportions", () => {
  const motion = resourceArtworkMotion("bgo-events-calendar")!;
  for (const [progress, angle] of [
    [0, -1.4],
    [0.5, 1.4],
    [1, -1.4],
  ]) {
    const {
      matrix: [a, b, c, d, x, y],
    } = interpolateArtworkMotion(motion, progress, linear, true);
    expect((Math.atan2(b, a) * 180) / Math.PI).toBeCloseTo(angle);
    expect(a * 109 + c * 178 + x).toBeCloseTo(109);
    expect(b * 109 + d * 178 + y).toBeCloseTo(178);
    expect(a * d - b * c).toBeCloseTo(1);
  }
});

it("applies easing within each keyframe segment rather than to the entire loop", () => {
  const easing = vi.fn((value: number) => value * value);
  const motion = resourceArtworkMotion("bgo-events-accessory")!;
  expect(interpolateArtworkMotion(motion, 0.25, easing, true).matrix[5]).toBe(-1);
  expect(easing).toHaveBeenCalledWith(0.5);
  expect(interpolateArtworkMotion(motion, 0.5, linear, true).matrix[5]).toBe(-4);
});

it("reproduces the die roll's translation, rotation, rest and center", () => {
  const motion = resourceArtworkMotion("bgo-tables-die")!;
  for (const [progress, expectedY, angle] of [
    [0, 0, 0],
    [0.25, -3, -9],
    [0.35, -1.5, -1],
    [0.45, 0, 7],
    [0.65, 0, 0],
    [0.9, 0, 0],
  ]) {
    const {
      matrix: [a, b, c, d, x, y],
    } = interpolateArtworkMotion(motion, progress, linear, true);
    expect((Math.atan2(b, a) * 180) / Math.PI).toBeCloseTo(angle);
    expect(c * 3 + x).toBeCloseTo(0);
    expect(d * 3 + y).toBeCloseTo(3 + expectedY);
  }
});

it("keeps the approved token hop, staggered members and badge pulse", () => {
  const token = resourceArtworkMotion("bgo-tables-token")!;
  expect(interpolateArtworkMotion(token, 0.3, linear, true).matrix[5]).toBe(-5);
  expect(interpolateArtworkMotion(token, 0.8, linear, true).matrix[5]).toBe(0);
  for (const [index, delay] of [
    [0, 0],
    [1, 0.7],
    [2, 1.4],
  ]) {
    const member = resourceArtworkMotion(`bgo-groups-member-${index}`)!;
    expect(
      interpolateArtworkMotion(member, 0.35 - delay / 4.8, linear, true).matrix[5],
    ).toBeCloseTo(-4);
    expect(
      interpolateArtworkMotion(member, 0.75 - delay / 4.8, linear, true).matrix[5],
    ).toBeCloseTo(0);
  }
  const badge = resourceArtworkMotion("bgo-groups-badge")!;
  expect(interpolateArtworkMotion(badge, 0.5, linear, true).opacity).toBe(0.65);
});
