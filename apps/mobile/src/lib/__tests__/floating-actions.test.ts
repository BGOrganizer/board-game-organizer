import { describe, expect, it } from "vitest";
import { FLOATING_ACTION_SIZE, floatingActionLayout } from "../floating-actions";

describe("floating action clearance", () => {
  it.each([
    [0, 16, 24],
    [0, 100, 100],
    [34, 16, 50],
    [34, 100, 134],
    [120, 100, 220],
  ])("keeps the final row above the FAB for inset %i and offset %i", (inset, offset, bottom) => {
    const layout = floatingActionLayout(inset, offset);
    expect(layout.bottom).toBe(bottom);
    expect(layout.paddingBottom).toBe(bottom + FLOATING_ACTION_SIZE + 16);
    expect(layout.paddingBottom - layout.bottom - FLOATING_ACTION_SIZE).toBe(16);
  });
});
