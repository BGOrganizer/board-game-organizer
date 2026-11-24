# React rendering benchmarks

Web and mobile have separate Vitest rendering suites using React Testing Library and React Native
Testing Library respectively, with `@callstack/reassure-measure`, Reassure's measurement module.
There is no Jest runner. Versions are locked in the app manifests and `bun.lock`.

Branch, Preview and Main CI run Web and Mobile Reassure jobs and publish paired reports. The
reports surface regression results independently of the coverage and deployment gates. The
comparator and paired-helper unit tests run in the ordinary Web suite.

Run local measurements with the Node.js and Bun versions required by [AGENTS.md](../AGENTS.md),
from the repository root:

```sh
bun install --frozen-lockfile
bun run perf:web
bun run perf:mobile
```

Measurements are written to each app's `.reassure/current.perf`, ignored by Git. Each
execution starts a fresh report; preserve the previous file separately before another run if
comparing revisions. Measure both source versions consecutively on the same host, using the same
scenario behavior and rendering instrumentation. Record both product lockfiles rather than
requiring application versions, HeroUI or product CSS to remain unchanged. Measuring unchanged code
twice tests host noise, not an improvement over older code. Do not compare Raspberry durations with GitHub runner
durations. Avoid concurrent installs, typechecks, builds, browsers and device/performance jobs.
Verify that workspace-package links resolve to the measured checkout. Borrowing another
worktree's `node_modules` can load two copies of a stateful shared module when tests also use
relative source imports, invalidating ownership/rollback assertions and source attribution.
Run delivery checks in the canonical delivery checkout.

The suite uses one fork, a 1 GiB maximum V8 heap, exposed garbage collection and non-optimizing
Node flags explicitly forwarded to the Vitest worker, ten measured repetitions and one discarded warmup per scenario. A shared setup check rejects a worker without the actual exposed garbage collector or required V8 flags before collecting samples. Native behavior/coverage tests keep their ordinary worker settings. Reassure receives
Testing Library's render/cleanup functions through its custom-renderer API. Vitest provides the
assertions and test lifecycle. The upstream Reassure CLI is not used: it targets Jest. No changes
or patches are applied to Reassure itself.

Web benchmarks use the real web components, HeroUI and the app's Lingui test provider in jsdom.
Mobile benchmarks use `vitest-native` to transform React Native's Flow source and React Native
Testing Library's async renderer. They import actual application, React Native and HeroUI
implementations; maintained native-runtime presets and controlled device/provider adapters cover
boundaries unavailable in Node. In particular, use the real Safe Area provider with initial
metrics rather than replacing application components. Await native render, events and cleanup.

Native test startup compiles the actual app stylesheet with its Metro/Uniwind transformer and
loads the generated registration from ignored `.reassure/native-styles.cjs`; its metadata records
source, configuration and dependency digests. Do not substitute copied theme colors. The project
animation adapter preserves the maintained native preset, uses the installed SDK's pure
interpolation math and reads current shared-value styles without fabricating React commits.
Popover tests supply measured anchor/content geometry at the native boundary, including the
offscreen first layout and positioned second layout; they retain real visibility assertions.

A test-only CommonJS loader delegates native imports to the application's actual importer-aware
Metro/Uniwind resolver, preserving its raw React Native exceptions. This executes the installed
Uniwind wrappers against the compiled application stylesheet; it does not replace components,
copy palette values or mutate React Native's public namespace. External ESM facades and embedded
module registries remain outside that interception. Safe Area and Gorhom resolve to the same actual
CommonJS modules used by HeroUI so their contexts stay shared. Separate adapter regressions verify
styled controls, hidden measuring content and native API identities. These checks do not execute
Android's Yoga, Fabric, UI thread or complete Metro graph.

The native runtime boundary also routes Android's horizontal scroll host through the maintained
runner's existing scroll binding factory, with the original horizontal configuration. This lets
Testing Library dispatch actual horizontal scroll gestures while retaining React Native and
HeroUI JavaScript, refs and command behavior. Regression tests cover horizontal events, imperative
commands and unchanged vertical behavior. Neither adapter establishes device frame timing; use
native acceptance and profiling for that evidence.

Ordinary behavior tests remain separate from benchmarks:

```sh
bun run --filter web test src/components
bun run --filter mobile test:components
```

The mobile unit configuration combines its logic and native projects into one source-wide
coverage report. Coverage includes uncovered application sources; benchmarks, fixtures and test
helpers are not runtime product code. A benchmark subset cannot establish the
[entire-project coverage gate](../AGENTS.md#7-verification).

Shared's ordinary `test` command selects Node logic tests. Its `test:coverage` combines those tests
with actual React/Query hook and form drivers from Web, retaining all Shared, Query and Store runtime
sources in one report. Coverage globs use absolute workspace roots so browser drivers do not add
unrelated Web UI to the Shared report. Web owns its full source tree, its deployed push worker and
the API-hosted invitation UI; explicitly selected Shared hooks remain additional Web coverage.

Select state tests use a separately named positioning helper. HeroUI's Select primitive flattens
its animated style into a plain snapshot before the readiness effect updates the shared value;
the Node animation preset cannot propagate that later native opacity update into the copy.
Those tests provide exactly two layout passes and assert on-screen position/readiness, then
exercise actual search/selection callbacks with explicit hidden-element queries. They establish
React state retention, not animated visibility or physical tappability. The generic Popover helper
keeps its visibility assertions. Select's complete visible/touch interaction requires Maestro on
a device; do not disable its animations, force additional React commits or add artificial layout
jitter to turn the renderer limitation into passing acceptance evidence.

The maintained Reanimated preset also does not execute UI-thread reactions. Gorhom's Android
bottom-sheet opening depends on those reactions, so its body remains at its initial native opacity
in Node. The actual `EventJoinSheet` and bottom-sheet editor/menu tests therefore check rendered React content, voting state,
consent, requests and authoritative updates without claiming sheet visibility or physical touch
acceptance. Keep the real sheet implementation and motion settings. Verify opening and voting on
the device through the native invitation Maestro journey; a passing state test does not replace it.

## Regression assertions

Each scenario must assert the actual result of its render/update interaction before accepting
Reassure samples. Include repeated selection, retained local state and fresh authoritative props
where relevant. Do not replace the measured component with a stand-in or count calls in place of
React Profiler commits.

Measure each first-party React component either as a scenario root or through a verified scenario
that renders it. Account for components reachable only through a route, an opened disclosure,
authoritative responses or provider effects. Check runtime reachability in a separate
coverage-instrumented pass. Use uninstrumented Reassure runs for the render counts and durations
reported by the comparison jobs.

Calibrate commit-count ceilings from repeated runs with the same fixtures. Both suites record
explicit scenario ceilings in `apps/{web,mobile}/performance/renderCommitBudgets.ts` and reject
additional commits, unknown scenarios and invalid samples. Portable multi-commit budgets allow
a total of two commits above the ceiling across ten samples and a maximum mean increase of 0.2.
Hosted runs of unchanged components occasionally observed either one or two extra commits in an
individual list, popover or tab transition. Single-commit scenarios keep a strict ceiling on every
sample. An excess exceeding two commits, in one sample or across several, fails. Recheck a changed
scenario before updating its
ceiling; do not raise budgets merely to obtain a passing run. Native detail and score-save
scenarios deliver actual Query notifications within the React action to avoid a timer racing
the next interaction. The score-save fixture releases the held HTTP response separately so the
pending edit and the authoritative receipt both contribute to the result. Duration samples remain
recorded separately: a deterministic commit-count contract is not a native latency guarantee.

## Paired statistical CI checks

The Branch/PR and Main jobs measure each app's approved baseline and the current checkout in the
**same job, consecutively**. The baseline runs the scenarios with calibrated commit ceilings in its
own budget inventory. The current checkout runs the entire suite and must report each of its approved
scenarios. This preserves measured history when a previously paused suite contains uncalibrated
cases. The two checkouts have separate locked installations, completed before either timing run.
Web and mobile have independent reports and use separate comparisons. The artifact name includes
the workflow attempt so a retry can preserve its own measurements.

The Web baselines at `13c84d3e` and `39d48803` share the same historical fixtures for numbered
table labels, clickable vote choices and restored HeroUI tab indicators. Those three scenarios run
in the full candidate suite with their calibrated ceilings and current behavior assertions.
Comparisons against these two immutable revisions report the three scenarios as additions.

PR uses its immutable base SHA; a branch push resolves the repository's default branch to the
actual checked-out SHA. Main uses the push event's previous SHA. The candidate is the actual
workflow checkout, including a PR merge checkout when GitHub supplies one. The
[paired helper](../scripts/performance/run-render-pair.mjs) verifies both actual Git HEADs and
tracked cleanliness during preparation and immediately before and after each measured phase.
Untracked generated files and the nested baseline checkout do not count as product edits.
A dirty local checkout cannot supply an honest commit-identified pair: ordinary local benchmark
commands above remain useful for development, but are not an approved historical comparison.

The helper starts the installed baseline Vitest process, then the installed current process, with
the same worker flags. It records actual installed React, renderer, Testing Library, Reassure,
Vitest and relevant native adapter/compiler versions, plus configuration/setup digests.
Web's coverage settings are outside the instrumentation digest because the exact benchmark
configuration disables coverage. Different
product locks, app versions, HeroUI or generated CSS remain visible without being equated to test
instrumentation. Unsupported instrumentation changes fail the comparison and require review;
do not relabel another host's saved report as this job's baseline.

The [comparison wrapper](../scripts/performance/compare-render-reports.mjs) uses the official
`@callstack/reassure-compare` package directly in a fresh Node process. It validates the current
named budget inventory, ten raw render counts, ten duration samples including removed outliers,
one warmup and each calibrated commit ceiling before accepting the report. The historical report
must include every scenario selected from the baseline checkout's budgets. Official errors,
statistically significant duration increases of at least 0.2 ms and 15%, and removed scenarios fail the
gate. One Web reactivation run observed shifts up to 0.152 ms with identical application code
and scenario assertions. A second run with the same application code observed phase drift up to
12.35% on previously matched scenarios. The report retains smaller timing differences, improvements, added
scenarios, warnings and stability. The commit-count ceilings remain independently enforced.

The approved initial main, `466220e26f672ad8de644e0a2c2ce223f02879df`, has no performance harness.
Only that exact no-harness source may bootstrap: current runs normally, every current scenario is
reported as added, and the output explicitly says historical timings were not compared. No old
samples are fabricated. Missing or malformed later baselines fail; running unchanged current
code twice is calibration, not a historical before/after comparison.

Artifacts live outside the app reports under `.reassure-pair/<app>/`: raw baseline/current reports,
phase logs, `provenance.json`, `status.json` and comparison output when a valid pair reached the
comparator. Provenance binds actual source SHAs, runner/job identity, Node/flags, instrumentation,
product lock and budget hashes, measurement intervals and raw report hashes. Mobile also preserves
its compiled native style artifact/receipt with hashes when available. Baseline failures still allow
an independently valid installed current suite to run, then fail the aggregate. Source drift during a run preserves
disqualified evidence and fails; a source rejected before launch never acquires stale report bytes.
Inspect these artifacts after failures instead of treating an absent comparison as a passing pair.

For an already prepared, clean pair, set `BASELINE_SHA` and `CURRENT_SHA` to the approved actual
commits, then run the same helper locally:

```sh
node scripts/performance/run-render-pair.mjs \
  --candidate-root /absolute/current-checkout \
  --baseline-root /absolute/approved-baseline-checkout \
  --app web \
  --baseline-ref "$BASELINE_SHA" \
  --current-ref "$CURRENT_SHA" \
  --output-dir /absolute/new-artifact-directory \
  --runner-id local-same-host-session
```

The output directory must not exist and must be outside either app directory. This command does
not install dependencies, select refs, publish artifacts or establish device/E2E acceptance.

## Calibrating new native scenarios

Run only the changed benchmark files, sequentially with no coverage or other heavy job. Each completed `measureRenders`
call appends its actual samples **before** the budget validator runs. An unknown-budget failure can
therefore leave useful calibration evidence; a render/interaction failure leaves no completed record
and must not be counted as a measured scenario.

```sh
bun run --filter mobile test:perf performance/common-presentation.perf.tsx performance/resource-cards.perf.tsx performance/fields-and-groups.perf.tsx
cp apps/mobile/.reassure/current.perf apps/mobile/.reassure/calibration-first.perf
bun run --filter mobile test:perf performance/common-presentation.perf.tsx performance/resource-cards.perf.tsx performance/fields-and-groups.perf.tsx
cp apps/mobile/.reassure/current.perf apps/mobile/.reassure/calibration-second.perf
```

Preserve both files before another run: global setup clears `current.perf`. The two calibration
commands may fail **only** because their new observed budgets are absent; inspect failures rather
than treating the exit status as acceptance. If compilation, interaction, assertions or sample
validation fail, correct that problem before deriving budgets. Use the same fixture and checkout
for both runs. This small Node report reads the JSONL files without loading Metro or a renderer:

```sh
node --input-type=module - apps/mobile/.reassure/calibration-first.perf apps/mobile/.reassure/calibration-second.perf <<'JS'
import { readFileSync } from "node:fs";
const files = process.argv.slice(2);
const reports = files.map(file => readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse));
const names = [...new Set(reports.flatMap(rows => rows.map(row => row.name)))].sort();
for (const name of names) {
  const rows = reports.map(rows => rows.find(row => row.name === name));
  if (rows.some(row => !row || row.runs !== 10 || row.counts.length !== 10 ||
    row.counts.some(count => !Number.isInteger(count) || count < 1) ||
    row.durations.length + (row.outlierDurations?.length ?? 0) !== 10 ||
    !Number.isFinite(row.meanDuration))) throw new Error(`Incomplete samples: ${name}`);
  const counts = rows.flatMap(row => row.counts);
  console.log(JSON.stringify({ name, reports: rows.length, samples: counts.length,
    minCommits: Math.min(...counts), maxCommits: Math.max(...counts),
    meanDurationsMs: rows.map(row => row.meanDuration) }));
}
console.log(`Completed scenarios in every report: ${names.length}`);
JS
```

Check the reported names against the selected files' scenario list; equal report lengths alone do
not detect a scenario missing from both runs. Review unexpected count differences before setting
each explicit ceiling in `apps/mobile/performance/renderCommitBudgets.ts`. Never substitute a
blanket default, infer an unmeasured ceiling or copy a timing limit from another host. Then rerun
the same files and the full benchmark suite: calibration failures are not the final passing gate.
Reassure removes timing outliers by default, so retained durations plus `outlierDurations` account
for ten measured runs, while all ten raw commit counts must always remain present.

## Interpretation

These are React rendering benchmarks under Node, not Android layout, Fabric commit, GPU animation,
native scrolling, network or database measurements. They cannot establish touch-to-screen latency.
React Native Testing Library and its React renderer exercise the React component tree; device-only
boundaries need test adapters. A component test with controlled snapshot props does not prove that
an API request, cache reconciliation or remote notification delivery works.

Use [Reassure's methodology](https://oss.callstack.com/reassure/docs/methodology/) to assess noise
and significance before selecting duration budgets. Branch, Preview and Main enforce the calibrated
commit budgets and paired comparisons in their Reassure jobs. The initial no-harness bootstrap is
explicitly unpaired.
These checks do not establish native latency or E2E acceptance. Native acceptance and profiling remain defined in
[verification](verification-and-acceptance.md), [native profiling](native-performance.md) and
[the Maestro guide](../apps/mobile/.maestro/README.md). Report executed scenarios and their limits;
installed tooling and written tests are not evidence that every component has been measured.
