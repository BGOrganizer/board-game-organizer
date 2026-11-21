import { expect, it } from "vitest";
import { gameDifficultyColor } from "../gameDifficultyColor";

it.each([
  [1, "success"],
  [1.5, "success"],
  [1.5001, "warning"],
  [3, "warning"],
  [3.01, "accent"],
  [4, "accent"],
  [4.01, "danger"],
  [5, "danger"],
  [5.01, undefined],
  [0.99, undefined],
  [null, undefined],
  [undefined, undefined],
  [Number.NaN, undefined],
  [Number.POSITIVE_INFINITY, undefined],
])("maps the validated BGG weight %s to %s", (weight, color) => {
  expect(gameDifficultyColor(weight)).toBe(color);
});
