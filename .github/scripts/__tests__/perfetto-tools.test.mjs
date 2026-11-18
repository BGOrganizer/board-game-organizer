import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "bgo perfetto "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    "scripts/performance/perfetto.sh",
    "scripts/performance/capture-maestro.py",
    "scripts/performance/android-summary.sql",
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(file, join(root, file));
  }
  const bin = join(root, "bin");
  mkdirSync(bin);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIXTURE: root };
  return { root, bin, env };
}

test("Perfetto installer rejects an unverified archive before extraction or execution", (t) => {
  const { root, bin, env } = fixture(t);
  writeFileSync(
    join(bin, "uname"),
    '#!/bin/sh\ncase "$1" in -s) echo Linux;; -m) echo aarch64;; esac\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "curl"),
    '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then printf corrupt > "$2"; exit 0; fi; shift; done\n',
    { mode: 0o755 },
  );
  writeFileSync(join(bin, "python3"), '#!/bin/sh\ntouch "$FIXTURE/unsafe-extraction"\n', {
    mode: 0o755,
  });
  const result = spawnSync("bash", ["scripts/performance/perfetto.sh", "--install"], {
    cwd: root,
    env,
  });
  assert.notEqual(result.status, 0);
  assert(!existsSync(join(root, "unsafe-extraction")));
  assert(!existsSync(join(root, ".tools/perfetto/59.1/trace_processor_shell")));
});

test("Perfetto runs only its pinned local binaries and preserves arguments and exit status", (t) => {
  const { root, env } = fixture(t);
  const tool = join(root, "scripts/performance/perfetto.sh");
  assert.notEqual(spawnSync("bash", [tool, "--version"], { env }).status, 0);
  const installed = join(root, ".tools/perfetto/59.1");
  mkdirSync(installed, { recursive: true });
  writeFileSync(
    join(installed, "trace_processor_shell"),
    '#!/bin/sh\nprintf "%s\\n" "$@"\nexit 17\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(installed, "record_android_trace"),
    'import sys\nprint("\\n".join(sys.argv[1:]))\nsys.exit(18)\n',
  );
  const query = spawnSync("bash", [tool, "-q", "query with spaces.sql", "capture.pftrace"], {
    env,
    encoding: "utf8",
  });
  assert.equal(query.status, 17);
  assert.deepEqual(query.stdout.trim().split("\n"), [
    "-q",
    "query with spaces.sql",
    "capture.pftrace",
  ]);
  const record = spawnSync("bash", [tool, "--record", "--no-open", "-s", "owned-device"], {
    env,
    encoding: "utf8",
  });
  assert.equal(record.status, 18);
  assert.deepEqual(record.stdout.trim().split("\n"), ["--no-open", "-s", "owned-device"]);
});

function captureFixture(t) {
  const data = fixture(t);
  const { root, bin, env } = data;
  const flow = "apps/mobile/.maestro/flows/focused.yaml";
  mkdirSync(dirname(join(root, flow)), { recursive: true });
  writeFileSync(
    join(root, flow),
    "appId: com.bgo.boardgameorganizer.dev\ntags: [manual, performance]\n---\n- assertVisible: Example\n",
  );
  writeFileSync(
    join(bin, "adb"),
    `#!/usr/bin/env python3
import os, sys
args = sys.argv[3:]
if args == ['get-state']: print('device')
elif args == ['shell','dumpsys','power']: print('mWakefulness=Awake')
elif args == ['shell','dumpsys','window','policy']: print('showing=' + os.environ.get('LOCKED','false'))
elif args == ['shell','dumpsys','window','windows']: print('mCurrentFocus=Window{1 u0 ' + os.environ.get('APP','com.bgo.boardgameorganizer.dev') + '/.MainActivity}')
elif args == ['shell','pm','path','com.bgo.boardgameorganizer.dev']: print('package:/data/app/dev/base.apk')
else: sys.exit(4)
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(root, "scripts/performance/perfetto.sh"),
    `#!/usr/bin/env bash
exec python3 "$FIXTURE/processor.py" "$@"
`,
  );
  writeFileSync(
    join(root, "processor.py"),
    `import csv, json, os, signal, sys
from pathlib import Path
root=Path(os.environ['FIXTURE'])
if sys.argv[1]=='--record':
 if os.environ.get('RECORD_FAILURE'): sys.exit(7)
 out=Path(sys.argv[sys.argv.index('-o')+1]); out.write_bytes(b'diagnostic fixture')
 (root/'ready').touch(); print('Trace started. Press CTRL+C to stop',flush=True)
 signal.signal(signal.SIGINT, lambda *_: sys.exit(0))
 signal.pause()
else:
 quality='invalid' if os.environ.get('LOSS') else 'ok'
 status='unavailable' if os.environ.get('NO_FRAMES') else 'measured'
 fields=['metric','status','samples','p50_ms','p95_ms']
 writer=csv.writer(sys.stdout);writer.writerow(fields)
 writer.writerows([
  ['trace_errors_or_data_loss',quality,1 if quality=='invalid' else 0,'[NULL]','[NULL]'],
  ['frame_completion',status,0 if status=='unavailable' else 3,'[NULL]' if status=='unavailable' else 8,'[NULL]' if status=='unavailable' else 12],
  ['frame_timeline_surface_records','unavailable',0,'[NULL]','[NULL]'],
  ['input_dispatch_to_ack','unavailable',0,'[NULL]','[NULL]'],
  ['input_to_associated_frame_present','unavailable',0,'[NULL]','[NULL]']])
`,
  );
  writeFileSync(
    join(root, "maestro.py"),
    `#!/usr/bin/env python3
import os, sys
from pathlib import Path
root=Path(os.environ['FIXTURE'])
if not (root/'ready').exists(): sys.exit(9)
(root/'flow-started').touch()
report=Path(sys.argv[sys.argv.index('--output')+1])
report.write_text('<testsuite><testcase name="fixture">' + ('<skipped/>' if os.environ.get('SKIPPED') else '') + '</testcase></testsuite>')
sys.exit(int(os.environ.get('FLOW_EXIT','0')))
`,
  );
  writeFileSync(join(root, "scripts/maestro.sh"), 'exec python3 "$FIXTURE/maestro.py" "$@"\n');
  const run = (extra = {}, args = []) =>
    spawnSync(
      "python3",
      [
        "scripts/performance/capture-maestro.py",
        "--serial",
        "owned-device",
        "--flow",
        flow,
        ...args,
      ],
      {
        cwd: root,
        env: {
          ...env,
          PERFETTO_BUILD_ACK: "owned-preview-build",
          NAVIGATION_API_URL: "https://api-development-pr-27-project.vercel.app",
          ...extra,
        },
        encoding: "utf8",
        timeout: 15000,
      },
    );
  const output = () => {
    const base = join(root, "apps/mobile/build-output/perfetto");
    return join(base, readdirSync(base)[0]);
  };
  return { ...data, run, output };
}

test("trace metrics parse real tabular CSV and reject incomplete or corrupt evidence", (t) => {
  const { root } = fixture(t);
  const columns = ["metric", "status", "samples", "p50_ms", "p95_ms"];
  const rows = [
    ["trace_errors_or_data_loss", "ok", 0, "[NULL]", "[NULL]"],
    ["frame_completion", "measured", 3, 8, 12],
    ["frame_timeline_surface_records", "unavailable", 0, "[NULL]", "[NULL]"],
    ["input_dispatch_to_ack", "unavailable", 0, "[NULL]", "[NULL]"],
    ["input_to_associated_frame_present", "unavailable", 0, "[NULL]", "[NULL]"],
  ];
  const csv = (values, header = columns) =>
    `${[header, ...values].map((row) => row.map((value) => `"${value}"`).join(",")).join("\n")}\n`;
  const altered = (row, column, value) =>
    rows.map((entry, index) =>
      entry.map((cell, field) => (index === row && field === column ? value : cell)),
    );
  const cases = [
    csv(rows),
    csv(rows, ["unexpected"]),
    csv(rows.slice(0, -1)),
    csv([...rows, rows[0]]),
    csv(altered(1, 2, -1)),
    csv(altered(1, 2, "1.5")),
    csv(altered(1, 2, 0)),
    csv(altered(2, 2, 1)),
    csv(altered(1, 3, "NaN")),
    csv(altered(1, 3, "Infinity")),
    csv(altered(1, 3, "[NULL]")),
    csv(altered(4, 3, 0)),
    csv(altered(1, 4, -1)),
    csv(altered(1, 1, "unknown")),
    csv(altered(0, 1, "measured")),
    csv(altered(0, 2, 1)),
    csv(altered(4, 0, "unknown")),
    csv([...rows.slice(0, -1), rows.at(-1).slice(0, -1)]),
  ];
  const program = [
    "import importlib.util, json, sys",
    "spec=importlib.util.spec_from_file_location('capture',sys.argv[1])",
    "module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)",
    "results=[]",
    "for source in json.load(sys.stdin):",
    " try: results.append({'metrics':module.parse_metrics(source)})",
    " except (RuntimeError, ValueError) as error: results.append({'error':str(error)})",
    "print(json.dumps(results))",
  ].join("\n");
  const result = spawnSync(
    "python3",
    ["-c", program, join(root, "scripts/performance/capture-maestro.py")],
    {
      input: JSON.stringify(cases),
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed[0].metrics[1], {
    metric: "frame_completion",
    status: "measured",
    samples: 3,
    p50_ms: 8,
    p95_ms: 12,
  });
  assert.equal(parsed[0].metrics[4].p50_ms, null);
  assert.equal(parsed[0].metrics[4].p95_ms, null);
  assert.equal(parsed.length, cases.length);
  assert(parsed.slice(1).every((entry) => typeof entry.error === "string"));
});

test("capture rejects unverified builds, Production, locked devices and guard overrides", (t) => {
  for (const extra of [
    { PERFETTO_BUILD_ACK: "" },
    { NAVIGATION_API_URL: "https://api.board-game-organizer.com" },
    { LOCKED: "true" },
    { APP: "com.bgo.boardgameorganizer" },
  ]) {
    const { root, run } = captureFixture(t);
    assert.notEqual(run(extra).status, 0);
    assert(!existsSync(join(root, "flow-started")));
  }
  for (const guard of [
    "APP_ID",
    "NAVIGATION_API_URL",
    "NAVIGATION_BUILD_ACK",
    "PERFETTO_BUILD_ACK",
  ]) {
    const { root, run } = captureFixture(t);
    assert.notEqual(run({}, ["-e", `${guard}=override`]).status, 0);
    assert(!existsSync(join(root, "flow-started")));
  }
});

test("capture waits for tracing readiness, preserves reports and reports unavailable input metrics", (t) => {
  const { run, output } = captureFixture(t);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const folder = output();
  assert.equal(JSON.parse(readFileSync(join(folder, "capture.json"))).status, "flow-completed");
  assert(existsSync(join(folder, "capture.pftrace")));
  const metrics = JSON.parse(readFileSync(join(folder, "summary.json")));
  assert.deepEqual(
    metrics.find((m) => m.metric === "input_to_associated_frame_present"),
    {
      metric: "input_to_associated_frame_present",
      status: "unavailable",
      samples: 0,
      p50_ms: null,
      p95_ms: null,
    },
  );
});

test("capture preserves failed/skipped journeys and rejects invalid or missing frame measurements", (t) => {
  for (const extra of [{ FLOW_EXIT: "3" }, { SKIPPED: "1" }, { LOSS: "1" }, { NO_FRAMES: "1" }]) {
    const { run, output } = captureFixture(t);
    assert.notEqual(run(extra).status, 0);
    assert(existsSync(join(output(), "capture.pftrace")));
    assert(existsSync(join(output(), "maestro.log")));
  }
  const { root, run } = captureFixture(t);
  assert.notEqual(run({ RECORD_FAILURE: "1" }).status, 0);
  assert(!existsSync(join(root, "flow-started")));
});
