import { expect, vi } from "vitest";

// Single execution under V8 coverage locates unexercised application code.
// These samples are not used to set budgets or compare render timings.
vi.mock("@callstack/reassure-measure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@callstack/reassure-measure")>();
  return {
    ...actual,
    measureRenders: (
      ui: Parameters<typeof actual.measureRenders>[0],
      options?: Parameters<typeof actual.measureRenders>[1],
    ) => actual.measureRenders(ui, { ...options, runs: 1, warmupRuns: 0, writeFile: false }),
  };
});

vi.mock("./assertRenderMeasurement", () => ({
  assertRenderMeasurement: (result: { counts: number[] }) => {
    expect(result.counts).toHaveLength(1);
    expect(result.counts[0]).toBeGreaterThan(0);
  },
}));
