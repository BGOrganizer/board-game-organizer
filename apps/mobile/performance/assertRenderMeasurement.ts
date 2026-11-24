import type { measureRenders } from "@callstack/reassure-measure";
import { expect } from "vitest";
import { withinRenderCommitBudget } from "../../../scripts/performance/render-commit-counts.mjs";
import { renderCommitBudgets } from "./renderCommitBudgets";

/** Validates actual Profiler samples; timing regression limits need a host-matched baseline. */
export function assertRenderMeasurement(
  result: Awaited<ReturnType<typeof measureRenders>>,
  scenario: string | undefined = expect.getState().currentTestName,
) {
  if (!scenario || !Object.hasOwn(renderCommitBudgets, scenario)) {
    throw new Error(`Missing observed render budget for ${scenario}`);
  }
  const maximumCommits = renderCommitBudgets[scenario];
  if (!Number.isInteger(maximumCommits) || maximumCommits < 1) {
    throw new Error(`Missing observed render budget for ${scenario}`);
  }
  expect(result.runs).toBe(10);
  expect(result.counts).toHaveLength(10);
  // Reassure may remove timing outliers; raw commit samples always retain every run.
  const durations = [...result.durations, ...(result.outlierDurations ?? [])];
  expect(durations).toHaveLength(10);
  expect(result.durations.length).toBeGreaterThan(1);
  expect(durations.every((duration) => Number.isFinite(duration) && duration >= 0)).toBe(true);
  expect(result.warmupDurations).toHaveLength(1);
  expect(
    result.warmupDurations.every((duration) => Number.isFinite(duration) && duration >= 0),
  ).toBe(true);
  expect(result.counts.every((count) => Number.isInteger(count) && count > 0)).toBe(true);
  expect(Number.isFinite(result.meanDuration)).toBe(true);
  expect(result.meanDuration).toBeGreaterThan(0);
  expect(Number.isFinite(result.meanCount)).toBe(true);
  expect(result.meanCount).toBeGreaterThanOrEqual(1);
  expect(
    withinRenderCommitBudget(result.counts, result.meanCount, maximumCommits),
    `Render regression in ${scenario}: ${result.counts.join(", ")} exceeds ${maximumCommits}`,
  ).toBe(true);
  for (const deviation of [result.stdevDuration, result.stdevCount]) {
    expect(Number.isFinite(deviation)).toBe(true);
    expect(deviation).toBeGreaterThanOrEqual(0);
  }
}
