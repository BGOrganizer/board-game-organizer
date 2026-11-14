import { expect, it } from "vitest";
import { personalRatingColor } from "../personalRatingColor";

it.each([
  [0, "danger"],
  [3, "danger"],
  [3.9, "danger"],
  [4, "warning"],
  [6.9, "warning"],
  [7, "accent"],
  [8.9, "accent"],
  [9, "success"],
  [10, "success"],
  [null, "default"],
  [undefined, "default"],
  [-1, "default"],
  [11, "default"],
  [Number.NaN, "default"],
] as const)("rates %s as %s", (value, color) => expect(personalRatingColor(value)).toBe(color));
