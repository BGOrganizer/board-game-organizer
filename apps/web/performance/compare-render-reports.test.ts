import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const script = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/performance/compare-render-reports.mjs",
);
const initialMain = "466220e26f672ad8de644e0a2c2ce223f02879df";
const baseRef = "a".repeat(40),
  headRef = "b".repeat(40);
const flags = [
  "--expose-gc",
  "--no-concurrent-sweeping",
  "--max-old-space-size=1024",
  "--max-opt=1",
];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const row = (name = "Measured scenario", duration = 10) => ({
  name,
  type: "render",
  runs: 10,
  meanDuration: duration,
  stdevDuration: 0,
  durations: Array<number>(10).fill(duration),
  warmupDurations: [duration],
  meanCount: 1,
  stdevCount: 0,
  counts: Array<number>(10).fill(1),
});
type Measurement = ReturnType<typeof row> & { outlierDurations?: number[]; issues?: unknown };
type FixtureOptions = {
  baseline?: Measurement[];
  baselineScenarios?: string[];
  current?: Measurement[];
  budgets?: Record<string, number>;
  bootstrap?: boolean;
};
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "bgo-render-compare-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
function fixture({
  baseline = [row()],
  baselineScenarios = baseline.map(({ name }) => name),
  current = [row()],
  budgets = { "Measured scenario": 1 },
  bootstrap = false,
}: FixtureOptions = {}) {
  const paths = {
    baseline: join(directory, "baseline.perf"),
    current: join(directory, "current.perf"),
    output: join(directory, "output.json"),
    provenance: join(directory, "provenance.json"),
    budgets: join(directory, "candidate/apps/web/performance/renderCommitBudgets.ts"),
  };
  mkdirSync(join(directory, "candidate/apps/web/performance"), { recursive: true });
  writeFileSync(join(directory, "candidate/package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(
    paths.budgets,
    `export const renderCommitBudgets: Readonly<Record<string, number>> = ${JSON.stringify(budgets)};\n`,
  );
  const lines = (values: Measurement[]) =>
    `${values.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  writeFileSync(paths.current, lines(current));
  if (!bootstrap) writeFileSync(paths.baseline, lines(baseline));
  const runner = {
    id: "this-physical-job",
    hostname: hostname(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    flags: [...flags],
  };
  const phase = (commitHash: string, file: string, startedAt: string, finishedAt: string) => ({
    commitHash,
    reportSha256: existsSync(file) ? hash(readFileSync(file, "utf8")) : "",
    budgetSha256: hash(readFileSync(paths.budgets, "utf8")),
    lockfileSha256: hash("fixture-lock"),
    instrumentationSha256: hash("fixture-instrumentation"),
    runner: { ...runner, flags: [...flags] },
    startedAt,
    finishedAt,
  });
  const proof = {
    version: 1,
    app: "web",
    baseline: bootstrap
      ? { commitHash: initialMain, hasHarness: false }
      : {
          ...phase(baseRef, paths.baseline, "2026-11-18T10:00:00.000Z", "2026-11-18T10:01:00.000Z"),
          scenarios: baselineScenarios,
        },
    current: phase(headRef, paths.current, "2026-11-18T10:01:00.000Z", "2026-11-18T10:02:00.000Z"),
  };
  const args = [
    "--app",
    "web",
    "--baseline",
    paths.baseline,
    "--current",
    paths.current,
    "--output",
    paths.output,
    "--provenance",
    paths.provenance,
    "--budgets",
    paths.budgets,
    "--baseline-ref",
    bootstrap ? initialMain : baseRef,
    "--current-ref",
    headRef,
    "--runner-id",
    runner.id,
    ...(bootstrap ? ["--bootstrap"] : []),
  ];
  return {
    paths,
    proof,
    args,
    run: () => {
      writeFileSync(paths.provenance, JSON.stringify(proof));
      const result = spawnSync(process.execPath, [script, ...args], {
        encoding: "utf8",
        timeout: 30_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      return result;
    },
    report: () => JSON.parse(readFileSync(paths.output, "utf8")),
  };
}

// Actual Node/filesystem and official comparator. Synthetic sample data validates
// this tool; it is never presented as a measured app or historical baseline.
it("uses official comparison for identical reports and preserves provenance/stability", () => {
  const f = fixture(),
    result = f.run();
  expect(result.status, result.stderr).toBe(0);
  expect(f.report()).toMatchObject({
    gate: { passed: true, mode: "comparison", timingsCompared: true },
    significant: [],
    added: [],
    removed: [],
    errors: [],
    warnings: [],
  });
  expect(f.report().meaningless).toHaveLength(1);
  expect(f.report().stability.current.weightedAverage).toBe(0);
  expect(f.report().provenance.current.commitHash).toBe(headRef);
});
it("fails a significant slowdown while retaining the actual official statistical evidence", () => {
  const f = fixture({ current: [row(undefined, 20)] });
  expect(f.run().status).toBe(1);
  expect(f.report().significant[0]).toMatchObject({
    durationDiff: 10,
    relativeDurationDiff: 1,
    isDurationDiffSignificant: true,
  });
  expect(f.report().gate.passed).toBe(false);
});
it("reports significant differences within the measured timing noise without failing the duration gate", () => {
  const f = fixture({ baseline: [row(undefined, 1)], current: [row(undefined, 1.15)] });
  expect(f.run().status).toBe(0);
  expect(f.report().significant[0].durationDiff).toBeCloseTo(0.15);
  expect(f.report().gate).toMatchObject({ passed: true, minimumDurationIncreaseMs: 0.2 });
});
it("records a significant improvement without reporting a regression", () => {
  const f = fixture({ current: [row(undefined, 5)] });
  expect(f.run().status).toBe(0);
  expect(f.report().significant[0].durationDiff).toBe(-5);
  expect(f.report().gate.reasons).toEqual([]);
});
it("bootstraps only the approved no-harness main and reports added scenarios without historical timings", () => {
  const f = fixture({ bootstrap: true });
  expect(f.run().status).toBe(0);
  expect(existsSync(f.paths.baseline)).toBe(false);
  expect(f.report().gate).toMatchObject({
    mode: "bootstrap",
    timingsCompared: false,
    passed: true,
  });
  expect(f.report().added.map((entry: { name: string }) => entry.name)).toEqual([
    "Measured scenario",
  ]);
  expect(f.report().warnings).toHaveLength(1);
});
it("rejects both a fabricated bootstrap report and an arbitrary bootstrap source", () => {
  const f = fixture({ bootstrap: true });
  writeFileSync(f.paths.baseline, JSON.stringify(row()));
  expect(f.run().stderr).toContain("Bootstrap is allowed only");
  rmSync(f.paths.baseline);
  f.proof.baseline.commitHash = baseRef;
  f.args[f.args.indexOf("--baseline-ref") + 1] = baseRef;
  expect(f.run().stderr).toContain("Bootstrap is allowed only");
});
it("fails a missing future baseline rather than silently accepting a bootstrap", () => {
  const f = fixture();
  rmSync(f.paths.baseline);
  const result = f.run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Missing baseline outside");
});
it("rejects a baseline missing an approved scenario", () => {
  const f = fixture({ baselineScenarios: ["Measured scenario", "Missing scenario"] });
  expect(f.run().stderr).toContain("Baseline measurement inventory does not match");
});
it("keeps raw commit ceilings strict even when a mean could hide an extra commit", () => {
  const value = row();
  value.counts[9] = 2;
  const f = fixture({ current: [value] });
  expect(f.run().stderr).toContain("render-count regression");
});
it("accounts for retained and removed outliers without hiding run instability", () => {
  const f = fixture({
    current: [{ ...row(), durations: Array<number>(9).fill(10), outlierDurations: [100] }],
  });
  expect(f.run().status).toBe(0);
  expect(f.report().meaningless[0].current.outlierDurations).toEqual([100]);
  expect(f.report().stability.current.weightedAverage).toBeGreaterThan(0);
});
it.each(["runs", "counts", "durations", "warmups", "mean"])(
  "rejects corrupt %s samples before official comparison",
  (field) => {
    const value = row();
    if (field === "runs") value.runs = 9;
    else if (field === "counts") value.counts[0] = 0;
    else if (field === "durations") value.durations.pop();
    else if (field === "warmups") value.warmupDurations = [];
    else value.meanDuration = 0;
    const f = fixture({ current: [value] });
    expect(f.run().status).toBe(1);
    expect(existsSync(f.paths.output)).toBe(false);
  },
);
it("rejects duplicates and missing current inventory rather than comparing a partial intersection", () => {
  const duplicate = fixture({ current: [row(), row()] });
  expect(duplicate.run().stderr).toContain("duplicate scenario");
  const missing = fixture({ budgets: { "Measured scenario": 1, "Missing scenario": 1 } });
  expect(missing.run().stderr).toContain("inventory does not match");
});
it("reports an added approved scenario honestly without inventing an old sample", () => {
  const f = fixture({
    current: [row(), row("Added scenario")],
    budgets: { "Measured scenario": 1, "Added scenario": 1 },
  });
  expect(f.run().status).toBe(0);
  expect(f.report().added[0].name).toBe("Added scenario");
});
it("fails removed scenarios and keeps their official removed entry", () => {
  const f = fixture({ baseline: [row(), row("Removed scenario")] });
  expect(f.run().status).toBe(1);
  expect(f.report().removed[0].name).toBe("Removed scenario");
  expect(f.report().gate.reasons).toContain("Removed measured scenario: Removed scenario");
});
it.each(["flags", "runner", "node", "source", "instrumentation", "overlap"])(
  "rejects incompatible %s provenance",
  (field) => {
    const f = fixture();
    if (field === "flags") f.proof.current.runner.flags.pop();
    else if (field === "runner") f.proof.current.runner.id = "another-physical-job";
    else if (field === "node") f.proof.current.runner.nodeVersion = "v20.0.0";
    else if (field === "source") f.proof.current.commitHash = "c".repeat(40);
    else if (field === "instrumentation")
      f.proof.current.instrumentationSha256 = hash("different instrumentation");
    else f.proof.current.startedAt = "2026-11-18T10:00:30.000Z";
    expect(f.run().status).toBe(1);
    expect(existsSync(f.paths.output)).toBe(false);
  },
);
it("binds the actual report and app budget bytes to their captured hashes", () => {
  const f = fixture();
  writeFileSync(f.paths.current, JSON.stringify(row(undefined, 20)));
  expect(f.run().stderr).toContain("Current report digest mismatch");
  writeFileSync(f.paths.current, `${JSON.stringify(row())}\n`);
  f.proof.current.reportSha256 = hash(readFileSync(f.paths.current, "utf8"));
  writeFileSync(f.paths.budgets, "export const renderCommitBudgets = {};\n");
  expect(f.run().stderr).toContain("Current budget digest mismatch");
});
it("uses official schema failures instead of mocking the comparator's statistical output", () => {
  const f = fixture({ current: [{ ...row(), issues: "invalid schema" }] });
  expect(f.run().status).toBe(1);
  expect(existsSync(f.paths.output)).toBe(false);
});

it("rejects a malformed future baseline rather than treating it as missing", () => {
  const f = fixture();
  writeFileSync(f.paths.baseline, "not JSON\n");
  if ("reportSha256" in f.proof.baseline)
    f.proof.baseline.reportSha256 = hash(readFileSync(f.paths.baseline, "utf8"));
  expect(f.run().status).toBe(1);
  expect(existsSync(f.paths.output)).toBe(false);
});
it("rejects an incorrect optional report source header", () => {
  const f = fixture();
  writeFileSync(
    f.paths.current,
    `${JSON.stringify({ metadata: { commitHash: baseRef } })}\n${JSON.stringify(row())}\n`,
  );
  f.proof.current.reportSha256 = hash(readFileSync(f.paths.current, "utf8"));
  expect(f.run().stderr).toContain("Measurement header source SHA mismatch");
});
