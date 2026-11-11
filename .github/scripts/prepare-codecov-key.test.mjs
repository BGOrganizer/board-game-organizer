import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";

const fingerprint = "27034E7FDB850E0BBC2C62FF806BB28AED779869";
const script = resolve(import.meta.dirname, "prepare-codecov-key.sh").replaceAll("\\", "/");
function run(mode) {
  const dir = mkdtempSync(join(tmpdir(), "bgo-codecov-key-"));
  const state = dir.replaceAll("\\", "/");
  try {
    writeFileSync(
      join(dir, "curl"),
      `#!/usr/bin/env bash
count=0
[[ -f "$TEST_STATE/count" ]] && count=$(< "$TEST_STATE/count")
count=$((count + 1))
printf '%s' "$count" > "$TEST_STATE/count"
[[ "$*" == *https://uploader.codecov.io/verification.gpg* ]] || exit 99
[[ "$TEST_MODE" == unavailable ]] && exit 22
[[ "$TEST_MODE" == transient && "$count" == 1 ]] && exit 22
printf 'test-only key payload' > "\${@: -1}"
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(dir, "gpg"),
      `#!/usr/bin/env bash
if [[ "$*" == *--show-keys* ]]; then
  [[ "$TEST_MODE" == malformed ]] && exit 2
  key=${fingerprint}
  [[ "$TEST_MODE" == wrong ]] && key=0000000000000000000000000000000000000000
  printf 'pub:::::::::\\nfpr:::::::::%s:\\n' "$key"
  [[ "$TEST_MODE" == multiple ]] && printf 'pub:::::::::\\nfpr:::::::::EXTRA_KEY:\\n'
  exit 0
fi
[[ "$*" == *--import* ]] || exit 9
[[ "$TEST_MODE" == import-failure ]] && exit 1
printf 'verified import' > "$TEST_STATE/imported"
`,
      { mode: 0o755 },
    );
    writeFileSync(join(dir, "sleep"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    const result = spawnSync("bash", ["--noprofile", "--norc", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: dir + delimiter + process.env.PATH,
        TEST_STATE: state,
        TEST_MODE: mode,
      },
    });
    if (result.error) throw result.error;
    return { ...result, requests: Number(readFileSync(join(dir, "count"), "utf8")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("imports only the pinned identity and retries a transient download", () => {
  assert.equal(run("valid").status, 0);
  const transient = run("transient");
  assert.equal(transient.status, 0);
  assert.equal(transient.requests, 2);
});
for (const mode of ["unavailable", "malformed", "wrong", "multiple", "import-failure"])
  test(`fails closed for ${mode}, with bounded retries`, () => {
    const result = run(mode);
    assert.notEqual(result.status, 0);
    assert.equal(result.requests, ["unavailable", "malformed"].includes(mode) ? 3 : 1);
  });

test("retains provider signature/checksum verification and blocking PR upload gates", () => {
  const workflow = readFileSync(resolve(import.meta.dirname, "../workflows/pr-ci.yml"), "utf8");
  assert.equal(
    (workflow.match(/run: bash \.github\/scripts\/prepare-codecov-key\.sh/g) ?? []).length,
    2,
  );
  assert.equal((workflow.match(/fail_ci_if_error: true/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /skip_validation:|CODECOV_SKIP_VALIDATION|use_pypi:|binary:/);
});
