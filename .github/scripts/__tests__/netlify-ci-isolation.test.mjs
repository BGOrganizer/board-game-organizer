import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const apiId = "11111111-1111-1111-1111-111111111111";
const webId = "22222222-2222-2222-2222-222222222222";
const apiDeploy = "1".repeat(24);
const webDeploy = "2".repeat(24);
const apiUrl = `https://${apiDeploy}--bgo-api-development.netlify.app`;
const webUrl = `https://${webDeploy}--bgo-web-development.netlify.app`;
const apiAlias = "https://ci-pr-35-123-1--bgo-api-development.netlify.app";
const webAlias = "https://ci-pr-35-123-1--bgo-web-development.netlify.app";
const sourceSha = "a".repeat(40);
const prHead = "b".repeat(40);

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "bgo-netlify-ci-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, "requests");
  const outputs = join(dir, "outputs");
  writeFileSync(log, "");
  writeFileSync(outputs, "");
  const executable = (name, shell) =>
    writeFileSync(join(dir, name), `#!/usr/bin/env bash\nset -euo pipefail\n${shell}\n`, {
      mode: 0o755,
    });
  const run = (script, args = [], env = {}) =>
    spawnSync("bash", [script, ...args], {
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        GITHUB_REPOSITORY: "BGOrganizer/board-game-organizer",
        GH_TOKEN: "github-fixture",
        RUNNER_TEMP: dir,
        CLERK_SECRET_KEY: "sk_test_fixture",
        NETLIFY_AUTH_TOKEN: "netlify-fixture",
        NETLIFY_ACCOUNT: "board-game-organizer",
        RECORD_DB: "bgo_ci_123_1",
        ARTIFACT_DB: "bgo_ci_123_1",
        ARTIFACT_URL: apiUrl,
        NETLIFY_BRANCH: "ci-pr-35-123-1",
        REQUESTS: log,
        GITHUB_OUTPUT: outputs,
        GITHUB_STEP_SUMMARY: join(dir, "summary"),
        ...env,
      },
    });

  executable(
    "curl",
    `
for arg in "$@"; do case "$arg" in https://*) url="$arg"; break ;; esac; done
printf '%s\n' "$url" >> "$REQUESTS"
case "$url" in
  'https://api.netlify.com/api/v1/board-game-organizer/sites?'*)
    jq -cn --arg account "$NETLIFY_ACCOUNT" '[{id:"${apiId}",name:"bgo-api-development",account_slug:$account},{id:"${webId}",name:"bgo-web-development",account_slug:$account}]'
    ;;
  'https://api.netlify.com/api/v1/deploys/${apiDeploy}')
    jq -cn --arg alias "$NETLIFY_BRANCH" '{id:"${apiDeploy}",site_id:"${apiId}",name:"bgo-api-development",state:"ready",context:"branch-deploy",branch:$alias,deploy_ssl_url:("https://"+$alias+"--bgo-api-development.netlify.app")}'
    ;;
  'https://api.netlify.com/api/v1/deploys/${webDeploy}')
    printf '%s' '${JSON.stringify({ id: webDeploy, site_id: webId, name: "bgo-web-development", state: "ready", context: "branch-deploy", branch: "ci-pr-35-123-1", deploy_ssl_url: webAlias })}'
    ;;
  'https://api.vercel.com/v13/deployments/owned.vercel.app?teamId=team-test')
    printf '%s' '{"url":"owned.vercel.app","projectId":"project-test","target":null}'
    ;;
  '${apiUrl}/api/admin/sync-user'|'https://owned.vercel.app/api/admin/sync-user?x-vercel-protection-bypass=bypass')
    [[ " $* " == *'Authorization: Bearer sk_test_fixture'* ]]
    jq -cn --arg db "$RECORD_DB" '{databaseName:$db}'
    ;;
  '${apiUrl}/api/admin/ci-db'|'https://owned.vercel.app/api/admin/ci-db?x-vercel-protection-bypass=bypass')
    [[ " $* " == *'"action":"cleanup"'* ]]
    [[ " $* " == *"$RECORD_DB"* ]]
    printf '%s' '{"ok":true}'
    ;;
  '${apiUrl}/api/health'|'${apiAlias}/api/health')
    printf '%s' '{"ok":true,"service":"board-game-organizer-api"}'
    ;;
  '${webUrl}/'|'${webAlias}/') ;;
  *) exit 1 ;;
esac`,
  );
  return {
    executable,
    run,
    requests: () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean),
    outputs: () => readFileSync(outputs, "utf8"),
  };
}

test("Netlify CI builds and attests an isolated pair before exposing outputs", (t) => {
  const { executable, run, requests, outputs } = fixture(t);
  executable(
    "git",
    `
case "$2" in HEAD) printf '${sourceSha}' ;; 'HEAD^2') printf '${prHead}' ;; *) exit 1 ;; esac`,
  );
  executable("node", 'test "$1" = .github/scripts/ci-current-pr.mjs');
  executable(
    "netlify",
    `
case " $* " in
  *' --filter apps/api '*)
    test "$BGO_CI_DB_NAME" = bgo_ci_123_1
    [[ " $* " == *' --env MONGODB_DB_NAME=bgo_ci_123_1 '* && " $* " != *MCP_RESOURCE_URL* ]]
    printf '%s' '{"site_id":"${apiId}","deploy_id":"${apiDeploy}"}'
    ;;
  *' --filter apps/web '*)
    test -z "\${BGO_CI_DB_NAME:-}"
    test "$BGO_NETLIFY_API_ORIGIN" = '${apiAlias}'
    printf '%s' '{"site_id":"${webId}","deploy_id":"${webDeploy}"}'
    ;;
  *) exit 1 ;;
esac`,
  );

  const result = run(".github/actions/netlify-deploy/deploy.sh", [], {
    BGO_NETLIFY_STAGE: "development",
    BGO_NETLIFY_ISOLATED: "true",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    PR_NUMBER: "35",
    PR_HEAD_SHA: prHead,
    SOURCE_SHA: sourceSha,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    outputs(),
    `api-url=${apiUrl}\napi-client-url=${apiAlias}\nweb-url=${webUrl}\nweb-client-url=${webAlias}\nci-db-name=bgo_ci_123_1\n`,
  );
  assert(!requests().some((url) => url.includes("/api/admin/ci-db")));
});

test("trusted cleanup checks project, run alias and runtime DB before Netlify writes", (t) => {
  const { executable, run, requests } = fixture(t);
  executable("node", 'test "$E2E_RUN_KEY" = 123_2');
  executable(
    "gh",
    `
if [ "$1" = api ]; then printf '73'; exit 0; fi
test "$2" = download && test "$5" = ci-api-url-2 && test "$6" = --dir
printf '%s' "$ARTIFACT_URL" > "$7/ci-api-url.txt"
if [ -n "$ARTIFACT_DB" ]; then printf '%s' "$ARTIFACT_DB" > "$7/ci-db-name.txt"; fi`,
  );

  const cleanup = (env = {}) => run(".github/scripts/cleanup-pr-e2e.sh", ["123", "2"], env);
  const success = cleanup();
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(requests().slice(-2), [
    `${apiUrl}/api/admin/sync-user`,
    `${apiUrl}/api/admin/ci-db`,
  ]);

  for (const env of [
    { NETLIFY_ACCOUNT: "unrelated-team" },
    { NETLIFY_BRANCH: "ci-pr-35-999-1" },
    { ARTIFACT_DB: "bgo_ci_123_3" },
    { RECORD_DB: "bgo_ci_123_2" },
    { ARTIFACT_URL: "https://unrelated.netlify.app" },
  ]) {
    const count = requests().length;
    assert.notEqual(cleanup(env).status, 0, JSON.stringify(env));
    assert(
      !requests()
        .slice(count)
        .some((url) => url.includes("/api/admin/ci-db")),
    );
  }

  const legacy = cleanup({
    ARTIFACT_URL: "https://owned.vercel.app",
    ARTIFACT_DB: "",
    RECORD_DB: "bgo_ci_123_2",
    VERCEL_ORG_ID: "team-test",
    VERCEL_API_PROJECT_ID: "project-test",
    VERCEL_TOKEN: "vercel-fixture",
    VERCEL_PROTECTION_BYPASS: "bypass",
  });
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.match(requests().at(-1), /owned\.vercel\.app\/api\/admin\/ci-db\?x-vercel/);
});

test("Netlify switches the build database only for an explicit isolated development deploy", () => {
  const nextConfig = new URL("../../../apps/api/next.config.ts", import.meta.url).href;
  const run = (env) =>
    spawnSync(
      process.execPath,
      [
        "-e",
        `await import(${JSON.stringify(nextConfig)}); console.log(process.env.MONGODB_DB_NAME);`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          VERCEL_ENV: "",
          BGO_NETLIFY_ISOLATED: "true",
          BGO_NETLIFY_STAGE: "development",
          BGO_CI_DB_NAME: "bgo_ci_123_1",
          MONGODB_DB_NAME: "staging",
          CLERK_WEBHOOK_DB_NAME: "",
          ...env,
        },
      },
    );
  const valid = run({});
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout.trim(), "bgo_ci_123_1");
  for (const env of [
    { BGO_NETLIFY_ISOLATED: "false" },
    { BGO_NETLIFY_STAGE: "production" },
    { VERCEL_ENV: "production" },
    { CLERK_WEBHOOK_DB_NAME: "other" },
    { BGO_CI_DB_NAME: "staging" },
  ])
    assert.notEqual(run(env).status, 0, JSON.stringify(env));
});
