import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const { runRenderPair } = await import(
  pathToFileURL(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../scripts/performance/run-render-pair.mjs",
    ),
  ).href
);
const initialMain = "466220e26f672ad8de644e0a2c2ce223f02879df";
const pausedMain = "13c84d3e9b3c17e6e817dd8685a97824336d17aa";
const baseRef = "a".repeat(40),
  currentRef = "b".repeat(40);
const flags = [
  "--expose-gc",
  "--no-concurrent-sweeping",
  "--max-old-space-size=1024",
  "--max-opt=1",
];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type PortOptions = { cwd?: string; logFile?: string };
type PortResult = { status: number; stdout: string; stderr: string; signal?: string };
type Execution = { binary: string; args: string[]; options?: PortOptions };
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "bgo-paired-render-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
function put(file: string, value: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
}
function fixture({ app = "web", bootstrap = false, historicalRef = baseRef } = {}) {
  const baseline = join(directory, "baseline checkout");
  const current = join(directory, "candidate checkout");
  const output = join(directory, "paired artifacts");
  const refs: Record<string, string> = {
    [baseline]: bootstrap ? initialMain : historicalRef,
    [current]: currentRef,
  };
  const statuses: Record<string, number> = { baseline: 0, current: 0, comparison: 0 };
  const omitReport = new Set<string>();
  const throws = new Set<string>();
  const calls: Execution[] = [];
  let dirty = "";
  const dirtyRoots: Record<string, string> = {};
  let beforeGit: ((root: string, operation: string) => void) | undefined;
  let during: ((phase: string) => void) | undefined;
  const extension = app === "web" ? "mts" : "ts";
  const common = ["vitest", "@callstack/reassure-measure", "react"];
  const packages = [
    ...common,
    ...(app === "web"
      ? [
          "react-dom",
          "@testing-library/react",
          "jsdom",
          "@lingui/vite-plugin",
          "@rolldown/plugin-babel",
        ]
      : [
          "react-native",
          "@testing-library/react-native",
          "test-renderer",
          "vitest-native",
          "react-native-reanimated",
          "react-native-worklets",
          "react-native-gesture-handler",
          "uniwind",
        ]),
  ];
  for (const root of [baseline, current]) {
    const appRoot = join(root, "apps", app);
    put(
      join(appRoot, "package.json"),
      JSON.stringify({
        name: app,
        version: "product-version",
        scripts:
          root === baseline && bootstrap
            ? {}
            : {
                "test:perf": `node ${flags.join(" ")} ../../node_modules/vitest/vitest.mjs run --config performance/vitest.config.${extension}`,
              },
      }),
    );
    if (root === baseline && bootstrap) continue;
    put(join(root, "bun.lock"), `actual distinct product lock for ${root}\n`);
    put(join(root, "scripts/performance/verify-worker.mjs"), "worker flags instrumentation\n");
    put(join(appRoot, `performance/vitest.config.${extension}`), "one-worker instrumentation\n");
    put(join(appRoot, "performance/global-setup.ts"), "measurement initialization\n");
    put(
      join(appRoot, "performance/renderCommitBudgets.ts"),
      "export const renderCommitBudgets = {'Measured scenario': 1};\n",
    );
    if (app === "web") {
      put(join(appRoot, "vitest.config.ts"), "transformer instrumentation\n");
      put(join(appRoot, "vitest.setup.ts"), "renderer cleanup instrumentation\n");
    } else {
      put(join(appRoot, "metro.config.js"), "native styling resolver instrumentation\n");
      for (const name of [
        "setup.ts",
        "reanimated-preset.ts",
        "gesture-handler-preset.ts",
        "horizontal-scroll-interop.ts",
        "uniwind-native-interop.ts",
        "compile-native-styles.mjs",
      ])
        put(join(appRoot, "performance", name), `actual adapter contract ${name}\n`);
    }
    for (const name of packages) {
      put(
        join(root, "node_modules", name, "package.json"),
        JSON.stringify({ name, version: "1.2.3", main: "index.js" }),
      );
      put(
        join(root, "node_modules", name, "index.js"),
        "// Process-boundary fixture: package resolution only, never executed.\n",
      );
      if (name === "vitest")
        put(
          join(root, "node_modules", name, "vitest.mjs"),
          "// Process boundary, not a renderer.\n",
        );
    }
  }
  const args = [
    "--app",
    app,
    "--baseline-root",
    baseline,
    "--candidate-root",
    current,
    "--baseline-ref",
    refs[baseline],
    "--current-ref",
    currentRef,
    "--output-dir",
    output,
    "--runner-id",
    "same-host-job-session",
  ];
  const execute = (binary: string, argv: string[], options?: PortOptions): PortResult => {
    calls.push({ binary, args: argv, options });
    if (binary === "git") {
      beforeGit?.(argv[1], argv.includes("rev-parse") ? "head" : "status");
      return {
        status: 0,
        stdout: argv.includes("rev-parse") ? refs[argv[1]] : (dirtyRoots[argv[1]] ?? dirty),
        stderr: "",
      };
    }
    if (options?.logFile) put(options.logFile, "actual process output boundary\n");
    const phase = argv.includes("--config")
      ? options?.cwd?.startsWith(baseline)
        ? "baseline"
        : "current"
      : "comparison";
    if (throws.has(phase)) throw new Error(`${phase} process could not start`);
    if (phase !== "comparison") {
      const generated = join(options?.cwd ?? "", ".reassure");
      expect(existsSync(join(generated, "current.perf"))).toBe(false);
      if (!omitReport.has(phase))
        put(
          join(generated, "current.perf"),
          `${phase} raw samples owned by the official-comparator tests\n`,
        );
      put(join(generated, "current.metadata.json"), JSON.stringify({ phase }));
      put(
        join(generated, "resource-card-update-group.rows.json"),
        JSON.stringify({ phase, rows: 8 }),
      );
      during?.(phase);
    }
    return { status: statuses[phase], stdout: "", stderr: "" };
  };
  const proof = () => JSON.parse(readFileSync(join(output, "provenance.json"), "utf8"));
  const summary = () => JSON.parse(readFileSync(join(output, "status.json"), "utf8"));
  return {
    args,
    baseline,
    current,
    output,
    refs,
    dirtyRoots,
    statuses,
    calls,
    omitReport,
    throws,
    proof,
    summary,
    run: () => runRenderPair(args, execute),
    dirty: (value: string) => {
      dirty = value;
    },
    beforeGit: (callback: (root: string, operation: string) => void) => {
      beforeGit = callback;
    },
    during: (callback: (phase: string) => void) => {
      during = callback;
    },
    measurements: () => calls.filter(({ args }) => args.includes("--config")),
    comparisons: () =>
      calls.filter(({ args }) => args.some((arg) => arg.endsWith("compare-render-reports.mjs"))),
  };
}

// This orchestration unit controls PROCESS ports only. Actual FS/version lookup/
// hashes/metadata remain real. Official statistical output has its separate real
// subprocess suite; these command fixtures are never performance measurements.
it("runs the isolated installed baseline then candidate, preserving reports and actual provenance", () => {
  const f = fixture();
  expect(f.run()).toBe(0);
  expect(f.measurements().map(({ options }) => options?.cwd)).toEqual([
    join(f.baseline, "apps/web"),
    join(f.current, "apps/web"),
  ]);
  for (const { binary, args } of f.measurements()) {
    expect(binary).toBe(process.execPath);
    expect(args.slice(0, 4)).toEqual(flags);
    expect(args.slice(5, 8)).toEqual(["run", "--config", "performance/vitest.config.mts"]);
  }
  const [baseline, current] = f.measurements();
  expect(baseline.args.at(-2)).toBe("--testNamePattern");
  const selection = new RegExp(baseline.args.at(-1) ?? "");
  expect(selection.test("Measured scenario")).toBe(true);
  expect(selection.test("Not yet calibrated")).toBe(false);
  expect(current.args).not.toContain("--testNamePattern");
  const proof = f.proof();
  expect(proof.baseline.commitHash).toBe(baseRef);
  expect(proof.baseline.scenarios).toEqual(["Measured scenario"]);
  expect(proof.current.commitHash).toBe(currentRef);
  expect(proof.baseline.sourceChecks).toEqual({ before: true, after: true });
  expect(proof.current.sourceChecks).toEqual({ before: true, after: true });
  expect(proof.current.runner).toMatchObject({
    hostname: hostname(),
    id: "same-host-job-session",
    nodeVersion: process.version,
    flags,
  });
  expect(proof.current.instrumentationSha256).toBe(proof.baseline.instrumentationSha256);
  expect(proof.current.lockfileSha256).not.toBe(proof.baseline.lockfileSha256);
  expect(proof.current.reportSha256).toBe(
    hash(readFileSync(join(f.output, "current.perf"), "utf8")),
  );
  expect(Date.parse(proof.current.startedAt)).toBeGreaterThanOrEqual(
    Date.parse(proof.baseline.finishedAt),
  );
  expect(
    JSON.parse(
      readFileSync(join(f.output, "baseline.resource-card-update-group.rows.json"), "utf8"),
    ),
  ).toEqual({ phase: "baseline", rows: 8 });
  expect(f.comparisons()).toHaveLength(1);
  expect(f.comparisons()[0].args).toContain(join(f.output, "provenance.json"));
  expect(f.summary().passed).toBe(true);
});
it("uses the native config and installed renderer/preset versions without importing native UI", () => {
  const f = fixture({ app: "mobile" });
  expect(f.run()).toBe(0);
  expect(f.measurements()[0].args).toContain("performance/vitest.config.ts");
  expect(f.proof().current.instrumentation.packages).toMatchObject({
    "@testing-library/react-native": "1.2.3",
    "vitest-native": "1.2.3",
    "test-renderer": "1.2.3",
    uniwind: "1.2.3",
  });
  expect(
    f.proof().current.instrumentation.files["apps/mobile/performance/uniwind-native-interop.ts"],
  ).toMatch(/^[a-f\d]{64}$/);
});
it("selects usable scenarios from the paused Web baseline", () => {
  const f = fixture({ historicalRef: pausedMain });
  put(
    join(f.baseline, "apps/web/performance/renderCommitBudgets.ts"),
    `export const renderCommitBudgets = ${JSON.stringify({
      "Measured scenario": 1,
      "EventTableCard window: twelve cached planning tables": 1,
      "OptionVoteVoters: compact named ballots": 1,
      "TabBar and TabTrigger: real HeroUI detail-tab changes": 10,
    })};`,
  );
  expect(f.run()).toBe(0);
  expect(f.proof().baseline.scenarios).toEqual(["Measured scenario"]);
  expect(f.measurements()[1].args).not.toContain("--testNamePattern");
});
it("allows only the initial no-harness main to bootstrap and never creates old samples", () => {
  const f = fixture({ bootstrap: true });
  expect(f.run()).toBe(0);
  expect(f.measurements()).toHaveLength(1);
  expect(f.proof().baseline).toEqual({ commitHash: initialMain, hasHarness: false });
  expect(existsSync(join(f.output, "baseline.perf"))).toBe(false);
  expect(f.comparisons()[0].args).toContain("--bootstrap");
});
it("fails later missing harnesses but still executes the candidate's real command", () => {
  const f = fixture();
  put(join(f.baseline, "apps/web/package.json"), JSON.stringify({ name: "web", scripts: {} }));
  expect(f.run()).toBe(1);
  expect(f.measurements()).toHaveLength(1);
  expect(f.measurements()[0].options?.cwd).toBe(join(f.current, "apps/web"));
  expect(f.summary().errors.join(" ")).toContain("Missing performance harness outside");
  expect(f.comparisons()).toHaveLength(0);
});
it.each(["exit", "throw", "missing-report", "lock-change"])(
  "continues current after baseline %s, preserves partial evidence and fails the aggregate",
  (failure) => {
    const f = fixture();
    if (failure === "exit") f.statuses.baseline = 2;
    else if (failure === "throw") f.throws.add("baseline");
    else if (failure === "missing-report") f.omitReport.add("baseline");
    else
      f.during((phase) => {
        if (phase === "baseline") put(join(f.baseline, "bun.lock"), "unexpected runtime mutation");
      });
    expect(f.run()).toBe(1);
    expect(f.measurements()).toHaveLength(2);
    expect(f.comparisons()).toHaveLength(0);
    expect(existsSync(join(f.output, "current.perf"))).toBe(true);
    expect(f.summary().passed).toBe(false);
    expect(f.summary().errors.length).toBeGreaterThan(0);
  },
);
it("aggregates both failed test commands and keeps both raw reports", () => {
  const f = fixture();
  f.statuses.baseline = 1;
  f.statuses.current = 2;
  expect(f.run()).toBe(1);
  expect(f.summary().errors).toEqual(
    expect.arrayContaining([
      expect.stringContaining("baseline: Performance tests exited 1"),
      expect.stringContaining("current: Performance tests exited 2"),
    ]),
  );
  for (const phase of ["baseline", "current"])
    expect(existsSync(join(f.output, `${phase}.perf`))).toBe(true);
});
it("propagates the official comparator exit without discarding source reports", () => {
  const f = fixture();
  f.statuses.comparison = 1;
  expect(f.run()).toBe(1);
  expect(f.summary().errors).toContain("Comparison failed; inspect comparison.log/comparison.json");
  expect(existsSync(join(f.output, "baseline.perf"))).toBe(true);
});
it.each(["version", "adapter"])(
  "refuses incompatible actual %s instrumentation while still running both suites",
  (change) => {
    const f = fixture({ app: "mobile" });
    if (change === "version")
      put(
        join(f.current, "node_modules/test-renderer/package.json"),
        JSON.stringify({ name: "test-renderer", version: "9.9.9", main: "index.js" }),
      );
    else
      put(
        join(f.current, "apps/mobile/performance/reanimated-preset.ts"),
        "changed native adapter contract",
      );
    expect(f.run()).toBe(1);
    expect(f.measurements()).toHaveLength(2);
    expect(f.comparisons()).toHaveLength(0);
    expect(f.summary().errors.join(" ")).toContain("instrumentation differs");
  },
);
it("allows application version, HeroUI, CSS, budgets and product lock changes without equating product metadata", () => {
  const f = fixture();
  const manifest = JSON.parse(readFileSync(join(f.current, "apps/web/package.json"), "utf8"));
  put(
    join(f.current, "apps/web/package.json"),
    JSON.stringify({ ...manifest, version: "9.0.0", dependencies: { "@heroui/react": "99.0.0" } }),
  );
  put(join(f.current, "apps/web/global.css"), "actual changed product styles");
  put(
    join(f.current, "apps/web/performance/renderCommitBudgets.ts"),
    "export const renderCommitBudgets = {'New measured scenario': 2};\n",
  );
  expect(f.run()).toBe(0);
  expect(f.proof().current.instrumentationSha256).toBe(f.proof().baseline.instrumentationSha256);
  expect(f.proof().current.budgetSha256).not.toBe(f.proof().baseline.budgetSha256);
});
it("removes only known generated sampling files before rerunning, preserving the native compiler cache", () => {
  const f = fixture();
  for (const root of [f.current, f.baseline]) {
    put(join(root, "apps/web/.reassure/current.perf"), "stale measurement");
    put(join(root, "apps/web/.reassure/native-styles.cjs"), "actual retained compiler cache");
  }
  expect(f.run()).toBe(0);
  expect(readFileSync(join(f.current, "apps/web/.reassure/native-styles.cjs"), "utf8")).toBe(
    "actual retained compiler cache",
  );
  expect(readFileSync(join(f.output, "current.perf"), "utf8")).not.toContain("stale");
});
it("rejects actual checkout SHA drift without hiding the other candidate's run", () => {
  const f = fixture();
  f.refs[f.baseline] = "c".repeat(40);
  expect(f.run()).toBe(1);
  expect(f.measurements()).toHaveLength(1);
  expect(f.summary().errors.join(" ")).toContain("Checkout source SHA mismatch");
});
it("rejects tracked source edits before timing instead of assigning them the old commit identity", () => {
  const f = fixture();
  f.dirty(" M apps/web/src/Changed.tsx\n");
  expect(f.run()).toBe(1);
  expect(f.measurements()).toHaveLength(0);
  expect(f.summary().errors.join(" ")).toContain("Tracked checkout changes");
});
it("does not install missing renderer tooling and still attempts the intact candidate suite", () => {
  const f = fixture();
  rmSync(join(f.baseline, "node_modules/react-dom"), { recursive: true });
  expect(f.run()).toBe(1);
  expect(f.measurements()).toHaveLength(1);
  expect(f.calls.every(({ binary }) => binary === "git" || binary === process.execPath)).toBe(true);
});
it("keeps argument values as literal paths and runner IDs, never shell code", () => {
  const f = fixture();
  const literal = "job; $(touch impossible) `literal`";
  f.args[f.args.indexOf("--runner-id") + 1] = literal;
  expect(f.run()).toBe(0);
  expect(f.comparisons()[0].args[f.comparisons()[0].args.indexOf("--runner-id") + 1]).toBe(literal);
  expect(f.proof().current.runner.id).toBe(literal);
});
it.each(["same-root", "inside-app", "existing-output", "unknown-option"])(
  "rejects unsafe/stale %s configuration before launching any process",
  (invalid) => {
    const f = fixture();
    if (invalid === "same-root") f.args[f.args.indexOf("--baseline-root") + 1] = f.current;
    else if (invalid === "inside-app")
      f.args[f.args.indexOf("--output-dir") + 1] = join(f.current, "apps/web/generated");
    else if (invalid === "existing-output") mkdirSync(f.output);
    else f.args.push("--install", "yes");
    expect(() => f.run()).toThrow();
    expect(f.calls).toHaveLength(0);
  },
);

it.each([
  ["baseline", "head"],
  ["baseline", "tracked"],
  ["current", "head"],
  ["current", "tracked"],
])(
  "rejects %s %s mutation DURING measurement and still attempts the other valid phase",
  (phase, change) => {
    const f = fixture();
    const root = phase === "baseline" ? f.baseline : f.current;
    f.during((running) => {
      if (running !== phase) return;
      if (change === "head") f.refs[root] = "c".repeat(40);
      else f.dirtyRoots[root] = " M apps/web/src/Changed.tsx\n";
    });
    expect(f.run()).toBe(1);
    expect(f.measurements()).toHaveLength(2);
    expect(f.proof()[phase].sourceChecks).toEqual({ before: true, after: false });
    expect(f.summary().errors.join(" ")).toContain(`${phase}: source changed during measurement`);
    expect(f.comparisons()).toHaveLength(0);
    // Raw failed evidence remains, explicitly disqualified by sourceChecks/status.
    expect(existsSync(join(f.output, `${phase}.perf`))).toBe(true);
  },
);
it.each(["head", "tracked"])(
  "rejects baseline %s drift after BOTH preparations but still runs the valid current source",
  (change) => {
    const f = fixture();
    let candidatePrepared = false;
    f.beforeGit((root, operation) => {
      if (root !== f.current || operation !== "status" || candidatePrepared) return;
      candidatePrepared = true;
      if (change === "head") f.refs[f.baseline] = "c".repeat(40);
      else f.dirtyRoots[f.baseline] = " M apps/web/src/Changed.tsx\n";
    });
    expect(f.run()).toBe(1);
    expect(f.measurements()).toHaveLength(1);
    expect(f.measurements()[0].options?.cwd).toBe(join(f.current, "apps/web"));
    expect(f.proof().baseline.sourceChecks).toEqual({ before: false, after: false });
    expect(existsSync(join(f.output, "baseline.perf"))).toBe(false);
    expect(f.comparisons()).toHaveLength(0);
  },
);
it.each(["head", "tracked"])(
  "rejects current %s drift during baseline BEFORE launching or mislabelling current samples",
  (change) => {
    const f = fixture();
    // An old generated report must never acquire the current expected source SHA.
    put(join(f.current, "apps/web/.reassure/current.perf"), "stale and unrelated old samples");
    f.during((phase) => {
      if (phase !== "baseline") return;
      if (change === "head") f.refs[f.current] = "c".repeat(40);
      else f.dirtyRoots[f.current] = " M apps/web/src/Changed.tsx\n";
    });
    expect(f.run()).toBe(1);
    expect(f.measurements()).toHaveLength(1);
    expect(f.proof().current.sourceChecks).toEqual({ before: false, after: false });
    expect(f.proof().current.reportSha256).toBeUndefined();
    expect(existsSync(join(f.output, "current.perf"))).toBe(false);
    expect(f.comparisons()).toHaveLength(0);
  },
);
it("preserves actual native compiler receipts/artifact bytes with per-phase hashes independently of product differences", () => {
  const f = fixture({ app: "mobile" });
  f.during((phase) => {
    const root = phase === "baseline" ? f.baseline : f.current;
    const generated = join(root, "apps/mobile/.reassure");
    put(
      join(generated, "native-styles.cjs"),
      `actual generated ${phase} CSS registration artifact`,
    );
    put(
      join(generated, "native-styles.json"),
      JSON.stringify({ phase, artifact: { file: "native-styles.cjs" } }),
    );
  });
  expect(f.run()).toBe(0);
  for (const phase of ["baseline", "current"])
    for (const file of ["native-styles.cjs", "native-styles.json"]) {
      const bytes = readFileSync(join(f.output, `${phase}.${file}`), "utf8");
      expect(bytes).toContain(phase);
      expect(f.proof()[phase].nativeStyleArtifacts[file]).toBe(hash(bytes));
    }
  expect(f.proof().baseline.nativeStyleArtifacts["native-styles.cjs"]).not.toBe(
    f.proof().current.nativeStyleArtifacts["native-styles.cjs"],
  );
  expect(f.proof().baseline.instrumentationSha256).toBe(f.proof().current.instrumentationSha256);
});
