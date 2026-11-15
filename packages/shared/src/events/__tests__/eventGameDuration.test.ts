import { expect, it } from "vitest";
import { DEFAULT_GAME_DURATION_MINUTES, eventGameDuration } from "../eventGameDuration";

it("keeps saved historical durations, otherwise uses catalog or the automatic two-hour convention", () => {
  expect(DEFAULT_GAME_DURATION_MINUTES).toBe(120);
  expect(eventGameDuration({ durationMinutes: 45, maxPlayMinutes: 90 })).toBe(45);
  expect(eventGameDuration({ durationMinutes: 60, maxPlayMinutes: 90 })).toBe(60);
  expect(eventGameDuration({ maxPlayMinutes: 90 })).toBe(90);
  expect(eventGameDuration({})).toBe(120);
  expect(eventGameDuration({ maxPlayMinutes: null })).toBe(120);
  for (const value of [
    0,
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    expect(eventGameDuration({ maxPlayMinutes: value })).toBe(120);
});
