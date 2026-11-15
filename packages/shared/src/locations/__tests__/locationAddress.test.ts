import { describe, expect, it } from "vitest";
import { formatLocationAddress } from "../locationAddress";

describe("formatLocationAddress", () => {
  it.each([
    ["Via Roma 12, Milano, Italy", "Via Roma 12, Milano"],
    ["Via Roma 12, Milano, Italia", "Via Roma 12, Milano"],
    ["Via Roma 12, Milano,  ITALY  ", "Via Roma 12, Milano"],
    ["10 Main Street, London, United Kingdom", "10 Main Street, London"],
    ["10 Main Street, Parigi, Francia", "10 Main Street, Parigi"],
    ["Via Roma 12, Milano", "Via Roma 12, Milano"],
    ["Via Roma 12", "Via Roma 12"],
    ["Italia", "Italia"],
    ["Via Roma 12,", "Via Roma 12,"],
  ])("formats %s without dropping an unknown city", (address, expected) => {
    expect(formatLocationAddress(address)).toBe(expected);
  });
});
