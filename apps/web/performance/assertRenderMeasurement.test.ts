import type { measureRenders } from "@callstack/reassure-measure";
import { expect, it } from "vitest";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const scenario = "EmptyList: accessible empty state";
const valid = (): Awaited<ReturnType<typeof measureRenders>> => ({
  runs: 10,
  meanDuration: 1,
  stdevDuration: 0,
  durations: Array(10).fill(1),
  warmupDurations: [1],
  meanCount: 1,
  stdevCount: 0,
  counts: Array(10).fill(1),
  issues: { initialUpdateCount: 0, redundantUpdates: [] },
});

it("accepts complete profiler samples and legitimate timing outlier removal", () => {
  expect(() => assertRenderMeasurement(valid(), scenario)).not.toThrow();
  const measurement = valid();
  measurement.durations.pop();
  measurement.outlierDurations = [4];
  measurement.durations[0] = 0;
  expect(() => assertRenderMeasurement(measurement, scenario)).not.toThrow();
});

it("rejects an extra commit even if an aggregate mean hides it", () => {
  const measurement = valid();
  measurement.counts[9] = 2;
  expect(() => assertRenderMeasurement(measurement, scenario)).toThrow(/Render regression/);
});

it("accepts up to two single-commit variations in the measured route and rejects a recurring excess", () => {
  const route =
    "EventDetail: cached Participants and Tables entry and reentry keeps the event header";
  const measurement = {
    ...valid(),
    counts: [26, 26, 26, 26, 26, 26, 26, 26, 27, 28],
    meanCount: 26.3,
  };
  expect(() => assertRenderMeasurement(measurement, route)).not.toThrow();
  measurement.counts[8] = 28;
  expect(() => assertRenderMeasurement(measurement, route)).not.toThrow();
  measurement.counts[7] = 28;
  expect(() => assertRenderMeasurement(measurement, route)).toThrow(/Render regression/);
  measurement.counts[7] = measurement.counts[8] = 26;
  measurement.counts[9] = 29;
  expect(() => assertRenderMeasurement(measurement, route)).toThrow(/Render regression/);
});

it.each(["Unmeasured component", "toString", "__proto__"])(
  "rejects unregistered or inherited budget %s",
  (name) => {
    expect(() => assertRenderMeasurement(valid(), name)).toThrow(/Missing observed render budget/);
  },
);

it.each([9, 11])("rejects missing or extra samples (%s)", (samples) => {
  for (const field of ["counts", "durations"] as const) {
    const measurement = valid();
    measurement[field] = Array(samples).fill(1);
    expect(() => assertRenderMeasurement(measurement, scenario)).toThrow();
  }
  expect(() => assertRenderMeasurement({ ...valid(), runs: samples }, scenario)).toThrow();
});

it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid raw commit count %s",
  (count) => {
    const measurement = valid();
    measurement.counts[9] = count;
    expect(() => assertRenderMeasurement(measurement, scenario)).toThrow();
  },
);

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid recorded timing %s, including removed outliers and warmup",
  (duration) => {
    for (const field of ["durations", "warmupDurations"] as const) {
      const measurement = valid();
      measurement[field][0] = duration;
      expect(() => assertRenderMeasurement(measurement, scenario)).toThrow();
    }
    const measurement = valid();
    measurement.durations.pop();
    measurement.outlierDurations = [duration];
    expect(() => assertRenderMeasurement(measurement, scenario)).toThrow();
  },
);

it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid duration or commit aggregate %s",
  (mean) => {
    for (const field of ["meanDuration", "meanCount"] as const) {
      expect(() => assertRenderMeasurement({ ...valid(), [field]: mean }, scenario)).toThrow();
    }
  },
);

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid spread %s", (deviation) => {
  for (const field of ["stdevDuration", "stdevCount"] as const) {
    expect(() => assertRenderMeasurement({ ...valid(), [field]: deviation }, scenario)).toThrow();
  }
});

it("rejects missing warmup, incomplete outlier accounting and an impossible mean count", () => {
  expect(() => assertRenderMeasurement({ ...valid(), warmupDurations: [] }, scenario)).toThrow();
  expect(() => assertRenderMeasurement({ ...valid(), outlierDurations: [2] }, scenario)).toThrow();
  expect(() => assertRenderMeasurement({ ...valid(), meanCount: 2 }, scenario)).toThrow();
});
