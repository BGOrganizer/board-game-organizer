import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";

const load = (file) => parse(readFileSync(file, "utf8"));
const pr = load(".github/workflows/pr-ci.yml");
const main = load(".github/workflows/main-ci.yml");

test("deployment and provisioning jobs avoid unused installs; native reuse keeps its YAML dependency", () => {
  for (const [workflow, jobs] of [
    [
      pr,
      [
        "provision",
        "deploy-preview-api",
        "deploy-preview-web",
        "deploy-development-api",
        "deploy-development-web",
      ],
    ],
    [main, ["build-apk", "deploy-production"]],
  ]) {
    for (const id of jobs)
      assert(
        !workflow.jobs[id].steps.some((step) => step.uses === "./.github/actions/setup-bun"),
        id,
      );
  }
  for (const [workflow, id] of [[main, "notify-telegram"]]) {
    assert.equal(
      workflow.jobs[id].steps.find((step) => step.uses === "./.github/actions/setup-bun").with
        .install,
      "false",
    );
  }
  assert(
    pr.jobs["build-mobile-internal"].steps.some(
      (step) => step.uses === "./.github/actions/setup-bun",
    ),
  );
  assert.equal(
    pr.jobs["build-mobile-internal"].steps.find((step) => step.id === "build").with[
      "install-dependencies"
    ],
    "false",
  );
  for (const name of ["mobile-build", "vercel-deploy"])
    assert(
      load(`.github/actions/${name}/action.yml`).runs.steps.some(
        (step) => step.uses === "./.github/actions/setup-bun",
      ),
    );
});

test("EAS publication installs workspace dependencies before resolving Expo plugins", () => {
  for (const [workflow, id] of [
    [pr, "draft-release"],
    [main, "publish-release"],
  ]) {
    const steps = workflow.jobs[id].steps;
    const setupIndex = steps.findIndex((step) => step.uses === "./.github/actions/setup-bun");
    const uploadIndex = steps.findIndex((step) => step.run?.includes("eas-upload.mjs"));
    assert(setupIndex >= 0 && uploadIndex > setupIndex, id);
    assert.equal(steps[setupIndex].with?.install ?? "true", "true", id);
    assert.equal(steps[uploadIndex]["working-directory"], "apps/mobile", id);
  }
});

test("APK discovery reuses the list's revision instead of fetching each run again", () => {
  const run = pr.jobs["build-mobile-internal"].steps.find((step) => step.id === "reuse").run;
  assert.match(run, /\[\.id, \.head_sha\] \| @tsv/);
  assert.doesNotMatch(run, /actions\/runs\/\$id"/);
  assert.match(run, /mobile-build-changed\.mjs "\$RUN_SHA" "\$HEAD_SHA"/);
  assert.match(run, /\.expired==false/);
});

test("third-party actions and CLI installs have reviewed fixed identities", () => {
  const setup = readFileSync(".github/actions/setup-bun/action.yml", "utf8");
  assert.match(setup, /oven-sh\/setup-bun@[a-f0-9]{40} # v2/);
  for (const workflow of [pr, main]) {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith("codecov/")) assert.match(step.uses, /@[a-f0-9]{40}$/);
        assert.doesNotMatch(step.run ?? "", /npm install|@latest|curl[^\n]*\| bash/);
      }
    }
  }
  assert.match(
    readFileSync(".github/actions/mobile-build/action.yml", "utf8"),
    /bun add --global eas-cli@27\.7\.2/,
  );
  assert.match(
    readFileSync(".github/actions/vercel-deploy/action.yml", "utf8"),
    /bun add --global vercel@65\.14\.0/,
  );
});

test("deployment output remains data even when it contains JavaScript source characters", () => {
  const action = load(".github/actions/vercel-deploy/action.yml");
  const value = "https://preview.vercel.app/'; throw Error('injected'); //";
  for (const step of action.runs.steps.filter((item) => item.uses === "actions/github-script@v7")) {
    assert.equal(step.env.DEPLOYMENT_URL, "${{ steps.deploy.outputs.url }}");
    assert(!step.with.script.includes("${{"));
    const calls = [];
    runInNewContext(step.with.script, {
      process: { env: { DEPLOYMENT_URL: value, APP_NAME: "API", STATUS_CONTEXT: "preview" } },
      context: {
        issue: { number: 1 },
        repo: { owner: "owner", repo: "repo" },
        sha: "a".repeat(40),
      },
      github: {
        rest: {
          issues: { createComment: (body) => calls.push(body) },
          repos: { createCommitStatus: (body) => calls.push(body) },
        },
      },
    });
    assert.equal(calls.length, 1);
    assert((calls[0].body ?? calls[0].target_url).includes(value));
  }
});

test("fixture mirroring encodes payloads and bypass values as data for both player pairs", () => {
  const step = pr.jobs["sync-e2e-users"].steps.find((item) => item.env?.USER_ID);
  const dir = mkdtempSync(join(tmpdir(), "bgo-sync-users-"));
  try {
    const payloads = join(dir, "payloads");
    const urls = join(dir, "urls");
    const email = 'target"$(touch injected)@example.test';
    const result = spawnSync(
      "bash",
      [
        "-c",
        `
curl() {
  printf '%s\\n' "$4" >> "$URL_LOG"
  cat >> "$PAYLOAD_LOG"
  printf '\\n' >> "$PAYLOAD_LOG"
  printf '{"ok":true}'
}
${step.run}`,
      ],
      {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          API_URL: "https://api.vercel.app",
          BYPASS: "a&b?c=1",
          CLERK_SECRET_KEY: "sk_test_fixture",
          USER_ID: "user_actor",
          USER_EMAIL: "actor@example.test",
          USER_ID_2: "user_target",
          USER_EMAIL_2: email,
          PHONE_2: "+3901234567",
          NATIVE_USER_ID: "user_native",
          NATIVE_EMAIL: "native@example.test",
          NATIVE_USER_ID_2: "user_nativeTarget",
          NATIVE_EMAIL_2: email,
          NATIVE_PHONE_2: "+3909876543",
          DB_NAME: "bgo_ci_10_1",
          PAYLOAD_LOG: payloads,
          URL_LOG: urls,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const rows = readFileSync(payloads, "utf8")
      .trim()
      .split(/\n+/)
      .map((line) => JSON.parse(line));
    assert.equal(rows.length, 6);
    assert.deepEqual(
      rows.slice(0, 4).map((row) => row.clerkId),
      ["user_actor", "user_target", "user_native", "user_nativeTarget"],
    );
    assert.equal(rows[1].email, email);
    assert.equal(rows[3].mobileNumber, "+3909876543");
    assert.deepEqual(
      rows.slice(4).map((row) => row.userId),
      ["user_actor", "user_native"],
    );
    assert(readFileSync(urls, "utf8").includes("a%26b%3Fc%3D1"));
    assert.throws(() => readFileSync(join(dir, "injected")));
    assert(!`${result.stdout}${result.stderr}`.includes("sk_test_fixture"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Maestro checksum failure stops before extraction or execution", () => {
  const dir = mkdtempSync(join(tmpdir(), "bgo-maestro-installer-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "curl"),
      '#!/usr/bin/env bash\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then printf corrupt > "$2"; exit 0; fi; shift; done\n',
      { mode: 0o755 },
    );
    writeFileSync(join(bin, "unzip"), '#!/usr/bin/env bash\nprintf unsafe > "$INSTALL_MARKER"\n', {
      mode: 0o755,
    });
    const marker = join(dir, "marker");
    const run = spawnSync("bash", [".github/scripts/install-maestro.sh"], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HOME: dir,
        INSTALL_MARKER: marker,
        GITHUB_PATH: join(dir, "path"),
      },
      encoding: "utf8",
    });
    assert.notEqual(run.status, 0);
    assert.throws(() => readFileSync(marker));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
