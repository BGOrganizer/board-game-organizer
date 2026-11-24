import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const initialMain = "466220e26f672ad8de644e0a2c2ce223f02879df";
const pausedMain = "13c84d3e9b3c17e6e817dd8685a97824336d17aa";
// These historical fixtures predate the numbered table title, indicator and vote button changes.
const staleWebScenarios = new Set([
  "EventTableCard window: twelve cached planning tables",
  "OptionVoteVoters: compact named ballots",
  "TabBar and TabTrigger: real HeroUI detail-tab changes",
]);
const flags = [
  "--expose-gc",
  "--no-concurrent-sweeping",
  "--max-old-space-size=1024",
  "--max-opt=1",
];
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fileHash = (file) => hash(readFileSync(file));
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const matchingScenarios = (names) =>
  `(?:^| )(?:${names.map((name) => RegExp.escape(name.replaceAll(" > ", " "))).join("|")})$`;
const inside = (parent, file) => {
  const path = relative(parent, file);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};

// The workflow prepares both locked installations BEFORE invoking this helper.
// No shell, dependency installation, parallel measurements or source checkout here.
function command(binary, args, { cwd, logFile } = {}) {
  const log = logFile ? openSync(logFile, "w") : undefined;
  try {
    const result = spawnSync(binary, args, {
      cwd,
      encoding: "utf8",
      stdio: log === undefined ? ["ignore", "pipe", "pipe"] : ["ignore", log, log],
    });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.error?.message ?? result.stderr ?? "",
      signal: result.signal,
    };
  } finally {
    if (log !== undefined) closeSync(log);
  }
}

function optionsFor(argv) {
  const options = {};
  const names = [
    "app",
    "candidate-root",
    "baseline-root",
    "current-ref",
    "baseline-ref",
    "output-dir",
    "runner-id",
  ];
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index].replace(/^--/, "");
    ensure(
      argv[index] === `--${name}` &&
        names.includes(name) &&
        !Object.hasOwn(options, name) &&
        argv[index + 1],
      `Invalid or duplicate argument: ${argv[index]}`,
    );
    options[name] = argv[index + 1];
  }
  for (const name of names) ensure(options[name], `Required argument: --${name}`);
  ensure(["web", "mobile"].includes(options.app), "Expected app web or mobile");
  for (const name of ["current-ref", "baseline-ref"])
    ensure(/^[a-f\d]{40}$/.test(options[name]), "Expected immutable source SHAs");
  for (const name of ["candidate-root", "baseline-root"])
    options[name] = realpathSync(resolve(options[name]));
  ensure(
    options["candidate-root"] !== options["baseline-root"],
    "Two isolated checkouts are required",
  );
  options["output-dir"] = resolve(options["output-dir"]);
  for (const root of [options["candidate-root"], options["baseline-root"]])
    ensure(
      !inside(join(root, "apps"), options["output-dir"]),
      "Artifacts must be outside app directories",
    );
  ensure(
    !existsSync(options["output-dir"]),
    "Output directory must be new to exclude stale artifacts",
  );
  mkdirSync(options["output-dir"], { recursive: true });
  return options;
}

function installedPackage(require, name) {
  let path = dirname(require.resolve(name));
  while (true) {
    const file = join(path, "package.json");
    if (existsSync(file)) {
      const manifest = json(file);
      if (manifest.name === name) {
        ensure(
          typeof manifest.version === "string" && manifest.version.length > 0,
          `Missing installed version: ${name}`,
        );
        return { version: manifest.version, directory: path };
      }
    }
    const parent = dirname(path);
    ensure(parent !== path, `Cannot locate installed package: ${name}`);
    path = parent;
  }
}

function verifyCheckout(root, expectedRef, execute) {
  const git = execute("git", ["-C", root, "rev-parse", "HEAD"]);
  ensure(
    git.status === 0 && git.stdout.trim() === expectedRef,
    `Checkout source SHA mismatch: ${root}; expected ${expectedRef}, actual ${git.stdout.trim()}`,
  );
  const dirty = execute("git", ["-C", root, "status", "--porcelain", "--untracked-files=no"]);
  ensure(
    dirty.status === 0 && !dirty.stdout.trim(),
    `Tracked checkout changes during measurement ownership checks: ${root}`,
  );
  return git.stdout.trim();
}

function webInstrumentationHash(file) {
  const source = readFileSync(file, "utf8");
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const exported = syntax.statements.find(ts.isExportAssignment)?.expression;
  const config = exported && ts.isCallExpression(exported) ? exported.arguments[0] : undefined;
  const field = (object, key) =>
    object && ts.isObjectLiteralExpression(object)
      ? object.properties.find(
          (property) => ts.isPropertyAssignment(property) && property.name.getText(syntax) === key,
        )?.initializer
      : undefined;
  const coverage = field(field(config, "test"), "coverage");
  // The exact performance configuration is hashed separately and disables coverage.
  if (!coverage || !ts.isObjectLiteralExpression(coverage)) return hash(source);
  return hash(`${source.slice(0, coverage.getStart(syntax))}{}${source.slice(coverage.end)}`);
}

function prepare(root, expectedRef, app, phase, execute) {
  verifyCheckout(root, expectedRef, execute);
  const appRoot = join(root, "apps", app);
  const manifest = json(join(appRoot, "package.json"));
  const script = manifest.scripts?.["test:perf"];
  if (!script) {
    ensure(
      expectedRef === initialMain,
      "Missing performance harness outside approved initial main",
    );
    return { root, appRoot, commitHash: expectedRef, hasHarness: false };
  }
  const extension = app === "web" ? "mts" : "ts";
  ensure(
    script ===
      `node ${flags.join(" ")} ../../node_modules/vitest/vitest.mjs run --config performance/vitest.config.${extension}`,
    "Unsupported performance command; review instrumentation before comparing",
  );
  const require = createRequire(join(appRoot, "package.json"));
  const packageNames = [
    "vitest",
    "@callstack/reassure-measure",
    "react",
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
  const installed = Object.fromEntries(
    packageNames.map((name) => [name, installedPackage(require, name)]),
  );
  const files = [
    "scripts/performance/verify-worker.mjs",
    `apps/${app}/performance/vitest.config.${extension}`,
    `apps/${app}/performance/global-setup.ts`,
    ...(app === "web"
      ? ["apps/web/vitest.config.ts", "apps/web/vitest.setup.ts"]
      : [
          "apps/mobile/metro.config.js",
          ...[
            "setup.ts",
            "reanimated-preset.ts",
            "gesture-handler-preset.ts",
            "horizontal-scroll-interop.ts",
            "uniwind-native-interop.ts",
            "compile-native-styles.mjs",
          ].map((file) => `apps/mobile/performance/${file}`),
        ]),
  ];
  const instrumentation = {
    node: process.version,
    v8: process.versions.v8,
    flags,
    packages: Object.fromEntries(
      Object.entries(installed).map(([name, value]) => [name, value.version]),
    ),
    files: Object.fromEntries(
      files.map((file) => [
        file,
        file === "apps/web/vitest.config.ts"
          ? webInstrumentationHash(join(root, file))
          : fileHash(join(root, file)),
      ]),
    ),
  };
  const budgetFile = join(appRoot, "performance/renderCommitBudgets.ts");
  const { renderCommitBudgets } = require(budgetFile);
  const approved = Object.keys(renderCommitBudgets);
  const scenarioNames =
    phase === "baseline" && app === "web" && expectedRef === pausedMain
      ? approved.filter((name) => !staleWebScenarios.has(name))
      : approved;
  ensure(scenarioNames.length > 0, "Missing approved render scenarios");
  return {
    root,
    appRoot,
    commitHash: expectedRef,
    hasHarness: true,
    instrumentation,
    instrumentationSha256: hash(JSON.stringify(instrumentation)),
    lockfileSha256: fileHash(join(root, "bun.lock")),
    budgetSha256: fileHash(budgetFile),
    scenarioNames,
    vitest: join(installed.vitest.directory, "vitest.mjs"),
    config: `performance/vitest.config.${extension}`,
  };
}

export function runRenderPair(argv, execute = command) {
  const options = optionsFor(argv);
  const output = options["output-dir"];
  const proof = { version: 1, app: options.app };
  const results = {};
  const errors = [];
  const runner = {
    id: options["runner-id"],
    hostname: hostname(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    flags,
  };
  // Resolve both installed toolchains before either timing run, never during the pair.
  const prepared = {};
  for (const phase of ["baseline", "current"]) {
    try {
      prepared[phase] = prepare(
        options[phase === "current" ? "candidate-root" : "baseline-root"],
        options[phase === "current" ? "current-ref" : "baseline-ref"],
        options.app,
        phase,
        execute,
      );
      ensure(
        phase === "baseline" || prepared[phase].hasHarness,
        "Current checkout must have a performance harness",
      );
    } catch (error) {
      errors.push(`${phase}: ${error.message}`);
      results[phase] = { status: 1, error: error.message };
      delete prepared[phase];
    }
  }
  for (const phase of ["baseline", "current"]) {
    const entry = prepared[phase];
    if (!entry) continue;
    if (!entry.hasHarness) {
      try {
        verifyCheckout(entry.root, entry.commitHash, execute);
      } catch (error) {
        errors.push(`${phase}: ${error.message}`);
        results[phase] = { status: 1, error: error.message };
        continue;
      }
      proof[phase] = { commitHash: entry.commitHash, hasHarness: false };
      results[phase] = { status: 0, bootstrap: true };
      continue;
    }
    const phaseProof = {
      commitHash: entry.commitHash,
      budgetSha256: entry.budgetSha256,
      lockfileSha256: entry.lockfileSha256,
      instrumentationSha256: entry.instrumentationSha256,
      instrumentation: entry.instrumentation,
      runner,
      startedAt: new Date().toISOString(),
      sourceChecks: { before: false, after: false },
      ...(phase === "baseline" && { scenarios: entry.scenarioNames }),
    };
    proof[phase] = phaseProof;
    let attempted = false;
    try {
      verifyCheckout(entry.root, entry.commitHash, execute);
      phaseProof.sourceChecks.before = true;
      const generated = join(entry.appRoot, ".reassure");
      if (existsSync(generated))
        for (const file of readdirSync(generated))
          if (
            file === "current.perf" ||
            file === "current.metadata.json" ||
            /^resource-card-update-.+\.rows\.json$/.test(file)
          )
            rmSync(join(generated, file));
      attempted = true;
      const result = execute(
        process.execPath,
        [
          ...flags,
          entry.vitest,
          "run",
          "--config",
          entry.config,
          ...(phase === "baseline"
            ? ["--testNamePattern", matchingScenarios(entry.scenarioNames)]
            : []),
        ],
        { cwd: entry.appRoot, logFile: join(output, `${phase}.log`) },
      );
      results[phase] = result;
      ensure(
        result.status === 0,
        `Performance tests exited ${result.status}${result.signal ? ` (${result.signal})` : ""}`,
      );
    } catch (error) {
      errors.push(`${phase}: ${error.message}`);
      results[phase] = { ...results[phase], status: 1, error: error.message };
    } finally {
      phaseProof.finishedAt = new Date().toISOString();
      if (attempted) {
        try {
          verifyCheckout(entry.root, entry.commitHash, execute);
          phaseProof.sourceChecks.after = true;
        } catch (error) {
          errors.push(`${phase}: source changed during measurement: ${error.message}`);
        }
      }
      if (attempted) {
        try {
          const generated = join(entry.appRoot, ".reassure");
          if (existsSync(generated))
            for (const file of readdirSync(generated)) {
              if (file === "current.perf") {
                copyFileSync(join(generated, file), join(output, `${phase}.perf`));
                phaseProof.reportSha256 = fileHash(join(output, `${phase}.perf`));
              } else if (
                file === "current.metadata.json" ||
                (options.app === "mobile" &&
                  ["native-styles.json", "native-styles.cjs"].includes(file)) ||
                /^resource-card-update-.+\.rows\.json$/.test(file)
              ) {
                copyFileSync(join(generated, file), join(output, `${phase}.${file}`));
                if (file.startsWith("native-styles.")) {
                  phaseProof.nativeStyleArtifacts ??= {};
                  phaseProof.nativeStyleArtifacts[file] = fileHash(
                    join(output, `${phase}.${file}`),
                  );
                }
              }
            }
          if (!phaseProof.reportSha256) errors.push(`${phase}: missing measured report`);
          if (fileHash(join(entry.root, "bun.lock")) !== entry.lockfileSha256)
            errors.push(`${phase}: lockfile changed during measurement`);
        } catch (error) {
          errors.push(`${phase}: could not preserve/verify artifacts: ${error.message}`);
        }
      }
    }
  }
  if (
    prepared.baseline?.hasHarness &&
    prepared.current?.hasHarness &&
    prepared.baseline.instrumentationSha256 !== prepared.current.instrumentationSha256
  )
    errors.push(
      "Baseline/current measurement instrumentation differs; no timing comparison is valid",
    );
  writeFileSync(join(output, "provenance.json"), `${JSON.stringify(proof, null, 2)}\n`);
  const bootstrap = proof.baseline?.hasHarness === false;
  if (!errors.length) {
    try {
      const comparison = execute(
        process.execPath,
        [
          resolve(dirname(fileURLToPath(import.meta.url)), "compare-render-reports.mjs"),
          "--app",
          options.app,
          "--baseline",
          join(output, "baseline.perf"),
          "--current",
          join(output, "current.perf"),
          "--output",
          join(output, "comparison.json"),
          "--provenance",
          join(output, "provenance.json"),
          "--budgets",
          join(
            options["candidate-root"],
            "apps",
            options.app,
            "performance/renderCommitBudgets.ts",
          ),
          "--baseline-ref",
          options["baseline-ref"],
          "--current-ref",
          options["current-ref"],
          "--runner-id",
          options["runner-id"],
          ...(bootstrap ? ["--bootstrap"] : []),
        ],
        { cwd: options["candidate-root"], logFile: join(output, "comparison.log") },
      );
      results.comparison = comparison;
      if (comparison.status !== 0)
        errors.push("Comparison failed; inspect comparison.log/comparison.json");
    } catch (error) {
      errors.push(`Comparison process failed: ${error.message}`);
    }
  }
  writeFileSync(
    join(output, "status.json"),
    `${JSON.stringify({ app: options.app, results, errors, passed: errors.length === 0 }, null, 2)}\n`,
  );
  return errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = runRenderPair(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
