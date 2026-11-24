import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { withinRenderCommitBudget } from "./render-commit-counts.mts";

const initialMain = "466220e26f672ad8de644e0a2c2ce223f02879df";
// Same-runtime hosted comparisons saw sub-millisecond noise and up to 12.35% phase drift.
const minimumDurationIncreaseMs = 0.2;
const minimumRelativeDurationIncrease = 0.15;
const requiredFlags = [
  "--expose-gc",
  "--no-concurrent-sweeping",
  "--max-old-space-size=1024",
  "--max-opt=1",
];
const sha = /^[a-f\d]{40}$/;
const digest = /^[a-f\d]{64}$/;
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};

function argumentsFor(argv) {
  const options = {};
  const valued = new Set([
    "app",
    "baseline",
    "current",
    "output",
    "provenance",
    "budgets",
    "baseline-ref",
    "current-ref",
    "runner-id",
  ]);
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index].replace(/^--/, "");
    ensure(
      argv[index].startsWith("--") && (valued.has(name) || name === "bootstrap"),
      `Unknown argument: ${argv[index]}`,
    );
    ensure(!Object.hasOwn(options, name), `Duplicate argument: ${name}`);
    if (name === "bootstrap") options[name] = true;
    else {
      ensure(argv[index + 1] && !argv[index + 1].startsWith("--"), `Missing argument: ${name}`);
      options[name] = argv[++index];
    }
  }
  for (const name of valued)
    ensure(typeof options[name] === "string" && options[name], `Required argument: --${name}`);
  ensure(options.app === "web" || options.app === "mobile", "Expected app web or mobile");
  ensure(
    sha.test(options["baseline-ref"]) && sha.test(options["current-ref"]),
    "Expected immutable source SHAs",
  );
  ensure(
    resolve(options.current) !== resolve(options.baseline),
    "Baseline/current files must be distinct",
  );
  for (const input of [options.current, options.baseline, options.provenance, options.budgets])
    ensure(resolve(options.output) !== resolve(input), "Output must not overwrite an input");
  ensure(
    resolve(options.budgets)
      .replaceAll("\\", "/")
      .endsWith(`/apps/${options.app}/performance/renderCommitBudgets.ts`),
    "Expected the selected app's actual budget module",
  );
  return options;
}

function provenanceFor(options) {
  const proof = JSON.parse(readFileSync(options.provenance, "utf8"));
  ensure(proof.version === 1 && proof.app === options.app, "Unsupported provenance version/app");
  ensure(
    proof.current?.commitHash === options["current-ref"] &&
      proof.baseline?.commitHash === options["baseline-ref"],
    "Source SHA provenance mismatch",
  );
  ensure(proof.current.budgetSha256 === hash(options.budgets), "Current budget digest mismatch");
  const phases = options.bootstrap ? [proof.current] : [proof.baseline, proof.current];
  for (const phase of phases) {
    ensure(
      digest.test(phase.instrumentationSha256 ?? "") && digest.test(phase.lockfileSha256 ?? ""),
      "Missing instrumentation/lockfile digests",
    );
    ensure(
      phase.runner?.id === options["runner-id"] && phase.runner.hostname === hostname(),
      "Reports must belong to this physical runner session",
    );
    ensure(
      phase.runner.nodeVersion === process.version &&
        phase.runner.platform === process.platform &&
        phase.runner.arch === process.arch,
      "Node/platform/architecture provenance mismatch",
    );
    ensure(
      Array.isArray(phase.runner.flags) &&
        new Set(phase.runner.flags).size === phase.runner.flags.length &&
        requiredFlags.every((flag) => phase.runner.flags.includes(flag)),
      "Missing profiling worker flags",
    );
    ensure(
      typeof phase.startedAt === "string" &&
        typeof phase.finishedAt === "string" &&
        Number.isFinite(Date.parse(phase.startedAt)) &&
        Date.parse(phase.finishedAt) >= Date.parse(phase.startedAt),
      "Invalid measurement interval",
    );
  }
  ensure(proof.current.reportSha256 === hash(options.current), "Current report digest mismatch");
  if (options.bootstrap) {
    ensure(
      options["baseline-ref"] === initialMain &&
        options["current-ref"] !== initialMain &&
        proof.baseline.hasHarness === false &&
        !existsSync(options.baseline),
      "Bootstrap is allowed only for the approved initial main without a harness/report",
    );
  } else {
    ensure(existsSync(options.baseline), "Missing baseline outside explicit initial bootstrap");
    ensure(
      proof.baseline.reportSha256 === hash(options.baseline),
      "Baseline report digest mismatch",
    );
    ensure(
      proof.baseline.instrumentationSha256 === proof.current.instrumentationSha256 &&
        JSON.stringify([...proof.baseline.runner.flags].sort()) ===
          JSON.stringify([...proof.current.runner.flags].sort()),
      "Baseline/current instrumentation or worker flags differ",
    );
    ensure(
      Date.parse(proof.current.startedAt) >= Date.parse(proof.baseline.finishedAt),
      "Baseline/current must run consecutively, without overlap",
    );
  }
  return proof;
}

function measurements(file, expectedRef, budgets) {
  const rows = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  ensure(rows.length > 0, `Empty measurement file: ${file}`);
  if (rows[0]?.metadata !== undefined) {
    ensure(
      !rows[0].metadata.commitHash || rows[0].metadata.commitHash === expectedRef,
      "Measurement header source SHA mismatch",
    );
    rows.shift();
  }
  ensure(rows.length > 0, `No measured scenarios: ${file}`);
  const names = new Set();
  const numbers = (values) =>
    Array.isArray(values) && values.every((value) => Number.isFinite(value) && value >= 0);
  for (const row of rows) {
    ensure(
      typeof row?.name === "string" && row.name.length > 0 && !names.has(row.name),
      "Missing or duplicate scenario name",
    );
    names.add(row.name);
    ensure(
      row.type === "render" &&
        row.runs === 10 &&
        numbers(row.durations) &&
        row.durations.length > 1 &&
        numbers(row.outlierDurations ?? []) &&
        row.durations.length + (row.outlierDurations?.length ?? 0) === 10 &&
        numbers(row.warmupDurations) &&
        row.warmupDurations.length === 1,
      `Invalid ten-run/one-warmup duration samples: ${row.name}`,
    );
    ensure(
      Array.isArray(row.counts) &&
        row.counts.length === 10 &&
        row.counts.every((count) => Number.isInteger(count) && count > 0),
      `Invalid raw render counts: ${row.name}`,
    );
    ensure(
      Number.isFinite(row.meanDuration) &&
        row.meanDuration > 0 &&
        Number.isFinite(row.meanCount) &&
        row.meanCount >= 1 &&
        [row.stdevDuration, row.stdevCount].every((value) => Number.isFinite(value) && value >= 0),
      `Invalid measurement aggregates: ${row.name}`,
    );
    if (budgets)
      ensure(
        Object.hasOwn(budgets, row.name) &&
          withinRenderCommitBudget(row.name, row.counts, row.meanCount, budgets[row.name]),
        `Unknown scenario or render-count regression: ${row.name}`,
      );
  }
  if (budgets)
    ensure(
      names.size === Object.keys(budgets).length &&
        Object.keys(budgets).every((name) => names.has(name)),
      "Current measurement inventory does not match the approved app budgets",
    );
  return names;
}

export async function compareRenderReports(argv) {
  const options = argumentsFor(argv);
  // Instrumentation/runner metadata is captured by the CI measurement steps,
  // not inferred from a historical artifact downloaded from a different host.
  const provenance = provenanceFor(options);
  const { renderCommitBudgets } = await import(pathToFileURL(resolve(options.budgets)).href);
  ensure(
    renderCommitBudgets &&
      typeof renderCommitBudgets === "object" &&
      !Array.isArray(renderCommitBudgets) &&
      Object.keys(renderCommitBudgets).length > 0 &&
      Object.entries(renderCommitBudgets).every(
        ([name, value]) => name.length > 0 && Number.isInteger(value) && value > 0,
      ),
    "Invalid app budget inventory",
  );
  measurements(options.current, options["current-ref"], renderCommitBudgets);
  if (!options.bootstrap) {
    const baseline = measurements(options.baseline, options["baseline-ref"]);
    const approved = provenance.baseline.scenarios;
    ensure(
      Array.isArray(approved) &&
        approved.length === baseline.size &&
        new Set(approved).size === baseline.size &&
        approved.every((name) => baseline.has(name)),
      "Baseline measurement inventory does not match its approved scenarios",
    );
  }
  // One fresh CLI process per pair avoids upstream module-scoped warning/error
  // accumulation. The official package owns the statistics; no custom estimator.
  const { compare } = await import("@callstack/reassure-compare");
  await compare({
    baselineFile: options.baseline,
    currentFile: options.current,
    outputFile: options.output,
    outputFormat: "json",
  });
  const report = JSON.parse(readFileSync(options.output, "utf8"));
  ensure(
    [report.errors, report.warnings, report.significant, report.added, report.removed].every(
      Array.isArray,
    ),
    "Invalid official comparison output",
  );
  const slowdowns = report.significant.filter(
    (entry) =>
      entry.durationDiff >= minimumDurationIncreaseMs &&
      entry.relativeDurationDiff >= minimumRelativeDurationIncrease,
  );
  const reasons = [
    ...report.errors,
    ...slowdowns.map((entry) => `Significant duration regression: ${entry.name}`),
    ...report.removed.map((entry) => `Removed measured scenario: ${entry.name}`),
  ];
  const gate = {
    passed: reasons.length === 0,
    mode: options.bootstrap ? "bootstrap" : "comparison",
    timingsCompared: !options.bootstrap,
    minimumDurationIncreaseMs,
    minimumRelativeDurationIncrease,
    reasons,
  };
  writeFileSync(options.output, `${JSON.stringify({ ...report, provenance, gate }, null, 2)}\n`);
  console.log(
    JSON.stringify({
      app: options.app,
      ...gate,
      added: report.added.map((entry) => entry.name),
      warnings: report.warnings,
      stability: report.stability,
    }),
  );
  return gate.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = await compareRenderReports(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
