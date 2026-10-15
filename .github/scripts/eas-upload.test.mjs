import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";

const script = readFileSync(".github/scripts/eas-upload.mjs", "utf8").replace(
  /^import .*;\r?\n/gm,
  "",
);
const quota =
  "This account has used its local builds from the free plan this month, which will reset in 17 days (on Sun Nov 01 2026).";
const workflows = ["pr-ci.yml", "main-ci.yml"].map((name) =>
  parse(readFileSync(`.github/workflows/${name}`, "utf8")),
);
const release = parse(readFileSync(".github/actions/publish-draft-release/action.yml", "utf8"));

function execute(result, file = { isFile: () => true, size: 123 }) {
  const writes = {},
    calls = [],
    warnings = [],
    errors = [];
  const process = {
    argv: ["node", "eas-upload.mjs", "/verified.apk"],
    env: {
      GITHUB_OUTPUT: "output",
      GITHUB_STEP_SUMMARY: "summary",
      EXPO_TOKEN: "unit-private-token",
    },
    stderr: { write: (text) => errors.push(text) },
    exitCode: 0,
  };
  let error;
  try {
    runInNewContext(script, {
      process,
      URL,
      statSync: (path) => {
        assert.equal(path, "/verified.apk");
        return file;
      },
      spawnSync: (command, args, options) => {
        calls.push(command);
        assert.deepEqual(Array.from(args), [
          "upload",
          "--platform",
          "android",
          "--build-path",
          "/verified.apk",
          "--json",
        ]);
        assert.equal(options.env.FORCE_COLOR, "0");
        return result;
      },
      appendFileSync: (path, value) => {
        writes[path] = (writes[path] || "") + value;
      },
      console: { warn: (message) => warnings.push(message) },
    });
  } catch (caught) {
    error = caught;
  }
  return { writes, calls, warnings, errors, error, status: process.exitCode };
}

test("reported monthly local quota exits 1 and 4 skip only EAS registration", () => {
  for (const status of [1, 4]) {
    for (const stream of ["stdout", "stderr"]) {
      const result = execute({ status, stdout: "", stderr: "", [stream]: quota });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0);
      assert.equal(result.writes.output, "url=\nquota-exhausted=true\n");
      assert.match(result.warnings[0], /::warning::EAS upload skipped/);
      assert.match(result.writes.summary, /APK build and quality gates remain mandatory/);
      assert.doesNotMatch(
        JSON.stringify(result.writes) + result.warnings.join(),
        /unit-private-token/,
      );
    }
  }
});

test("replays the CI quota transcript with the observed process exit 1", () => {
  const cli = spawnSync(
    process.execPath,
    [
      "-e",
      `process.stderr.write(${JSON.stringify(`${quota}\nError: GraphQL request failed.\n`)}); process.exit(1);`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(cli.status, 1);
  const run = execute(cli);
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0);
  assert.equal(run.writes.output, "url=\nquota-exhausted=true\n");
});

test("successful EAS JSON exposes its real HTTPS URL; invalid replies remain fatal", () => {
  const url = "https://expo.dev/accounts/fixture/builds/fixture";
  const success = execute({ status: 0, stdout: JSON.stringify({ url }), stderr: "" });
  assert.equal(success.error, undefined);
  assert.equal(success.writes.output, `url=${url}\nquota-exhausted=false\n`);
  assert.equal(success.writes.summary, undefined);
  for (const stdout of [
    "not JSON",
    "{}",
    '{"url":123}',
    '{"url":""}',
    '{"url":"http://example.invalid"}',
    '{"url":"https://example.invalid\\n"}',
  ]) {
    const result = execute({ status: 0, stdout, stderr: "" });
    assert(result.error, stdout);
    assert.equal(result.writes.output, undefined);
  }
});

test("generic GraphQL, auth, other quotas, wrong exit, launch/signal errors and missing APK cannot pass", () => {
  for (const result of [
    { status: 1, stdout: "", stderr: "GraphQL request failed" },
    { status: 4, stdout: "", stderr: "GraphQL request failed" },
    { status: 1, stdout: "", stderr: "Unauthorized" },
    { status: 4, stdout: "", stderr: "Unauthorized" },
    { status: 4, stdout: "", stderr: "Cloud build quota exhausted" },
    { status: 2, stdout: quota, stderr: "" },
    { status: null, stdout: "", stderr: "terminated" },
  ]) {
    const run = execute(result);
    assert.equal(run.status, result.status || 1);
    assert.equal(run.writes.output, undefined);
    assert.equal(run.writes.summary, undefined);
    assert.equal(run.warnings.length, 0);
  }
  assert(execute({ error: new Error("CLI missing") }).error);
  for (const file of [
    { isFile: () => false, size: 1 },
    { isFile: () => true, size: 0 },
  ]) {
    const run = execute({}, file);
    assert(run.error);
    assert.equal(run.calls.length, 0);
  }
});

test("PR and main notifications omit unavailable EAS links but retain actual GitHub/Web/API links", () => {
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  for (const [index, workflow] of workflows.entries()) {
    const job = workflow.jobs[index === 0 ? "draft-release" : "notify-telegram"];
    const step = job.steps.find((s) => s.name === "🔗 Compose Telegram links");
    for (const url of ["", "https://expo.dev/accounts/fixture/builds/fixture"]) {
      const folder = mkdtempSync(join(tmpdir(), "bgo-eas-links-"));
      const target = join(folder, "links.html").replaceAll("\\", "/");
      try {
        const code = step.run
          .replaceAll("/tmp/telegram-links.html", `"${target}"`)
          .replace(/\$\{\{[^}]+}}/g, "https://fixture.example.invalid");
        const result = spawnSync(bash, ["-e", "-c", code], {
          encoding: "utf8",
          env: {
            ...process.env,
            EAS_BUILD_URL: url,
            RELEASE_URL: "https://github.com/fixture/releases/fixture",
          },
        });
        assert.equal(result.status, 0, result.stderr);
        const html = readFileSync(target, "utf8");
        assert.match(html, /APK .*GitHub/);
        assert.match(html, /Web/);
        assert.match(html, /API/);
        assert.equal(html.includes("Build (EAS"), Boolean(url));
        assert.doesNotMatch(html, /href=""/);
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    }
  }
});

test("optional EAS registration cannot disable APK, E2E, cleanup or publication gates", () => {
  const pr = workflows[0],
    main = workflows[1];
  for (const [workflow, name] of [
    [pr, "draft-release"],
    [main, "publish-release"],
  ]) {
    const job = workflow.jobs[name];
    const upload = job.steps.find((step) => step.id === "eas");
    assert.match(upload.run, /eas-upload\.mjs/);
    assert.equal(upload["continue-on-error"], undefined);
    assert.equal(job["continue-on-error"], undefined);
    assert(job.needs.includes("e2e-maestro"));
    assert(job.needs.includes("e2e-playwright"));
  }
  assert.notEqual(main.jobs["e2e-maestro"].if, `\${{ false }}`);
  assert.notEqual(main.jobs["e2e-playwright"].if, `\${{ false }}`);
  assert.match(pr.jobs["draft-release"].if, /needs\.build-mobile-internal\.result == 'success'/);
  assert.match(pr.jobs["draft-release"].if, /needs\.build-mobile-development\.result == 'success'/);
  assert.equal(pr.jobs["cleanup-e2e-user"].if, "always()");
  assert.equal(release.inputs["apk-path"].required, true);
  assert.equal(release.inputs["eas-build-url"].required, false);
  const body = release.runs.steps[0].run;
  assert.match(body, /if \[ -z "\$EAS_BUILD_URL" \]; then sed -i '\/__EAS_BUILD__\/d'/);
  assert.match(body, /--data-binary @/);
});
