import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const apiId = "11111111-1111-1111-1111-111111111111";
const webId = "22222222-2222-2222-2222-222222222222";
const siteId = "33333333-3333-3333-3333-333333333333";
const gatewayId = "44444444-4444-4444-4444-444444444444";
const apiDeploy = "1".repeat(24);
const webDeploy = "2".repeat(24);
const siteDeploy = "3".repeat(24);
const gatewayDeploy = "4".repeat(24);
const apiUrl = `https://${apiDeploy}--bgo-api-development.netlify.app`;
const webUrl = `https://${webDeploy}--bgo-web-development.netlify.app`;
const apiAlias = "https://ci-pr-35-123-1--bgo-api-development.netlify.app";
const webAlias = "https://ci-pr-35-123-1--bgo-web-development.netlify.app";
const developmentApiAlias = apiAlias.replace("ci-pr", "pr");
const developmentWebAlias = webAlias.replace("ci-pr", "pr");
const gatewayOrigin = "https://bgo-mcp-development.netlify.app";
const productionApiUrl = `https://${apiDeploy}--bgo-api-production.netlify.app`;
const productionNetlifyApi = "https://bgo-api-production.netlify.app";
const productionGateway = "https://bgo-mcp-production.netlify.app";
const canonicalApi = "https://api.board-game-organizer.com";
const canonicalWeb = "https://app.board-game-organizer.com";
const sourceSha = "a".repeat(40);
const prHead = "b".repeat(40);
const deployTitle = `bgo:${sourceSha}:${sourceSha}:123:1`;
const actionScript = ".github/actions/netlify-deploy/deploy.sh";
const developmentEnv = {
  BGO_NETLIFY_STAGE: "development",
  BGO_NETLIFY_ISOLATED: "true",
  GITHUB_EVENT_NAME: "pull_request",
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "1",
  PR_NUMBER: "35",
  PR_HEAD_SHA: prHead,
  SOURCE_SHA: sourceSha,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
};
const productionEnv = {
  BGO_NETLIFY_STAGE: "production",
  FIXTURE_STAGE: "production",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/main",
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "1",
  SOURCE_SHA: sourceSha,
  RELEASE_SHA: prHead,
  NETLIFY_TITLE: `bgo:${sourceSha}:${prHead}:123:1`,
  API_URL: productionApiUrl,
  API_CLIENT_URL: productionNetlifyApi,
};

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
        NETLIFY_TITLE: deployTitle,
        FIXTURE_STAGE: "development",
        PUBLISHED_API_DEPLOY: apiDeploy,
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
function render_deploy() {
  local id=$1 site=$2 component=$3 stage=$4 context=$5
  jq -cn --arg id "$id" --arg site "$site" --arg name "bgo-$component-$stage" \
    --arg context "$context" --arg branch "$NETLIFY_BRANCH" --arg title "$NETLIFY_TITLE" '
    {id:$id,site_id:$site,name:$name,state:"ready",context:$context,branch:$branch,title:$title,
    deploy_ssl_url:("https://"+$branch+"--"+$name+".netlify.app")}'
}
context=branch-deploy
if [ "$FIXTURE_STAGE" = production ]; then context=production; fi
case "$url" in
  "https://api.netlify.com/api/v1/\${NETLIFY_TEAM_SLUG:-board-game-organizer}/sites?"*)
    jq -cn --arg account "$NETLIFY_ACCOUNT" --arg stage "$FIXTURE_STAGE" '[
      {id:"${apiId}",name:("bgo-api-"+$stage),account_slug:$account},
      {id:"${webId}",name:("bgo-web-"+$stage),account_slug:$account},
      {id:"${siteId}",name:("bgo-site-"+$stage),account_slug:$account},
      {id:"${gatewayId}",name:("bgo-mcp-"+$stage),account_slug:$account}]'
    ;;
  'https://api.netlify.com/api/v1/sites/${apiId}')
    jq -cn --arg id "$PUBLISHED_API_DEPLOY" '{id:"${apiId}",name:"bgo-api-production",account_slug:"board-game-organizer",published_deploy:{id:$id}}'
    ;;
  'https://api.netlify.com/api/v1/sites/${webId}')
    printf '%s' '{"id":"${webId}","name":"bgo-web-production","account_slug":"board-game-organizer","published_deploy":{"id":"${webDeploy}"}}'
    ;;
  'https://api.netlify.com/api/v1/sites/${gatewayId}')
    jq -cn --arg stage "$FIXTURE_STAGE" '{id:"${gatewayId}",name:("bgo-mcp-"+$stage),account_slug:"board-game-organizer",published_deploy:{id:"${gatewayDeploy}"}}'
    ;;
  'https://api.netlify.com/api/v1/deploys/${apiDeploy}')
    render_deploy '${apiDeploy}' '${apiId}' api "$FIXTURE_STAGE" "$context"
    ;;
  'https://api.netlify.com/api/v1/deploys/${webDeploy}')
    render_deploy '${webDeploy}' '${webId}' web "$FIXTURE_STAGE" "$context"
    ;;
  'https://api.netlify.com/api/v1/deploys/${siteDeploy}')
    render_deploy '${siteDeploy}' '${siteId}' site development branch-deploy
    ;;
  'https://api.netlify.com/api/v1/deploys/${gatewayDeploy}')
    render_deploy '${gatewayDeploy}' '${gatewayId}' mcp "$FIXTURE_STAGE" production
    ;;
  'https://api.vercel.com/v13/deployments/owned.vercel.app?teamId=team-test')
    printf '%s' '{"url":"owned.vercel.app","projectId":"project-test","target":null}'
    ;;
  '${apiUrl}/api/admin/sync-user'|'https://owned.vercel.app/api/admin/sync-user?x-vercel-protection-bypass=bypass')
    [[ " $* " == *'Authorization: Bearer sk_test_fixture'* ]]
    jq -cn --arg db "$RECORD_DB" '{databaseName:$db}'
    ;;
  '${productionApiUrl}/api/admin/sync-user')
    [[ " $* " == *'Authorization: Bearer sk_live_fixture'* ]]
    printf '%s' '{"databaseName":"bgo"}'
    ;;
  '${apiUrl}/api/admin/ci-db'|'https://owned.vercel.app/api/admin/ci-db?x-vercel-protection-bypass=bypass')
    [[ " $* " == *'"action":"cleanup"'* ]]
    [[ " $* " == *"$RECORD_DB"* ]]
    printf '%s' '{"ok":true}'
    ;;
  '${apiUrl}/api/health'|'${apiAlias}/api/health'|'${productionApiUrl}/api/health'|'${productionNetlifyApi}/api/health')
    printf '%s' '{"ok":true,"service":"board-game-organizer-api"}'
    ;;
  '${webUrl}/'|'${webAlias}/'|'https://${webDeploy}--bgo-web-production.netlify.app/'|'https://bgo-web-production.netlify.app/') ;;
  'https://${siteDeploy}--bgo-site-development.netlify.app/'|'https://pr-35-123-1--bgo-site-development.netlify.app/') ;;
  'https://${gatewayDeploy}--bgo-mcp-development.netlify.app/.well-known/oauth-protected-resource/mcp'|'${gatewayOrigin}/.well-known/oauth-protected-resource/mcp')
    printf '%s' '{"resource":"${gatewayOrigin}/mcp"}'
    ;;
  '${productionApiUrl}/.well-known/oauth-protected-resource/mcp'|'https://${gatewayDeploy}--bgo-mcp-production.netlify.app/.well-known/oauth-protected-resource/mcp'|'${productionGateway}/.well-known/oauth-protected-resource/mcp')
    jq -cn --arg resource "\${OAUTH_RESOURCE:-${canonicalApi}/mcp}" '{resource:$resource}'
    ;;
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

function stubIsolatedDeploy(executable) {
  executable(
    "git",
    `
case "$2" in HEAD) printf '${sourceSha}' ;; 'HEAD^2') printf '${prHead}' ;; *) exit 1 ;; esac`,
  );
  executable("node", 'test "$1" = .github/scripts/ci-current-pr.mjs');
  executable(
    "netlify",
    `
test -z "\${CLERK_SECRET_KEY:-}"
[[ " $* " == *' --message ${deployTitle} '* && " $* " == *' --alias ci-pr-35-123-1 '* ]]
printf 'deploy command\n' >> "$REQUESTS"
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
}

test("Netlify deploys and attests the isolated API before exposing its outputs", (t) => {
  const { executable, run, requests, outputs } = fixture(t);
  stubIsolatedDeploy(executable);
  const result = run(actionScript, [], {
    ...developmentEnv,
    BGO_NETLIFY_COMPONENT: "api",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    outputs(),
    `api-url=${apiUrl}\napi-client-url=${apiAlias}\nci-db-name=bgo_ci_123_1\n`,
  );
  assert(requests().includes(`${apiAlias}/api/health`));
  assert(!requests().some((url) => url.includes("/api/admin/ci-db")));
});

test("Netlify limits discovery and deployment to the configured team", (t) => {
  const { executable, run, requests } = fixture(t);
  stubIsolatedDeploy(executable);
  const result = run(actionScript, [], {
    ...developmentEnv,
    BGO_NETLIFY_COMPONENT: "api",
    NETLIFY_TEAM_SLUG: "bgo-alternate",
    NETLIFY_ACCOUNT: "bgo-alternate",
  });
  assert.equal(result.status, 0, result.stderr);
  assert(requests().includes("https://api.netlify.com/api/v1/bgo-alternate/sites?per_page=100"));
});

test("Netlify Web keeps the attested isolated API alias on a partial rerun", (t) => {
  const { executable, run, requests, outputs } = fixture(t);
  stubIsolatedDeploy(executable);
  const result = run(actionScript, [], {
    ...developmentEnv,
    BGO_NETLIFY_COMPONENT: "web",
    GITHUB_RUN_ATTEMPT: "2",
    CLERK_SECRET_KEY: "",
    API_URL: apiUrl,
    API_CLIENT_URL: apiAlias,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(outputs(), `web-url=${webUrl}\nweb-client-url=${webAlias}\n`);
  assert(requests().includes(`${apiAlias}/api/health`));
  assert(!requests().some((url) => url.includes("/api/admin/")));
});

test("Netlify Web rejects API deploys with mismatched ownership, provenance or aliases", (t) => {
  const { executable, run, requests, outputs } = fixture(t);
  stubIsolatedDeploy(executable);
  for (const overrides of [
    { NETLIFY_ACCOUNT: "unrelated-team" },
    { NETLIFY_BRANCH: "ci-pr-35-999-1" },
    { NETLIFY_TITLE: deployTitle.replace(":123:", ":999:") },
    { NETLIFY_TITLE: deployTitle.replace(sourceSha, prHead) },
    { NETLIFY_TITLE: deployTitle.replace(/1$/, "2") },
    { API_CLIENT_URL: "https://arbitrary.netlify.app" },
    { API_URL: `${apiUrl}/unverified` },
  ]) {
    const result = run(actionScript, [], {
      ...developmentEnv,
      BGO_NETLIFY_COMPONENT: "web",
      API_URL: apiUrl,
      API_CLIENT_URL: apiAlias,
      ...overrides,
    });
    assert.notEqual(result.status, 0, JSON.stringify(overrides));
    assert.match(result.stderr, /requires a verified same-run api deployment/);
  }
  assert.equal(outputs(), "");
  assert(!requests().includes("deploy command"));
  assert(!requests().some((url) => url.startsWith(apiAlias)));
});

test("Netlify rejects an isolated non-API component and an unauthorized stable gateway", (t) => {
  const { executable, run, requests } = fixture(t);
  stubIsolatedDeploy(executable);
  const isolated = run(actionScript, [], {
    ...developmentEnv,
    BGO_NETLIFY_COMPONENT: "site",
  });
  assert.notEqual(isolated.status, 0);
  assert.match(isolated.stderr, /require the Development API or Web/);
  const unauthorized = run(actionScript, [], {
    ...developmentEnv,
    BGO_NETLIFY_ISOLATED: "false",
    BGO_NETLIFY_COMPONENT: "mcp",
    GATEWAY_PR: "34",
  });
  assert.notEqual(unauthorized.status, 0);
  assert.match(unauthorized.stderr, /not authorized to publish/);
  assert.deepEqual(requests(), []);
});

test("Netlify Development Site receives the verified same-run Web client URL", (t) => {
  const { executable, run, requests, outputs } = fixture(t);
  stubIsolatedDeploy(executable);
  executable(
    "netlify",
    `
[[ " $* " == *' --filter apps/site --site ${siteId} '* ]]
[[ " $* " == *' --message ${deployTitle} '* && " $* " == *' --alias pr-35-123-1 '* ]]
test "$BGO_NETLIFY_SITE_WEB_ORIGIN" = '${developmentWebAlias}'
printf 'deploy command\n' >> "$REQUESTS"
printf '%s' '{"site_id":"${siteId}","deploy_id":"${siteDeploy}"}'`,
  );
  const env = {
    ...developmentEnv,
    BGO_NETLIFY_ISOLATED: "false",
    BGO_NETLIFY_COMPONENT: "site",
    NETLIFY_BRANCH: "pr-35-123-1",
    WEB_URL: webUrl,
    WEB_CLIENT_URL: developmentWebAlias,
  };
  const wrongAlias = run(actionScript, [], { ...env, WEB_CLIENT_URL: webAlias });
  assert.notEqual(wrongAlias.status, 0);
  assert.match(wrongAlias.stderr, /requires a verified same-run web deployment/);
  assert(!requests().includes("deploy command"));

  const result = run(actionScript, [], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(outputs(), `site-url=https://${siteDeploy}--bgo-site-development.netlify.app\n`);
});

test("Netlify MCP publishes its existing stable URL with the verified same-run API origin", (t) => {
  const { executable, run, requests, outputs } = fixture(t);
  stubIsolatedDeploy(executable);
  executable("bun", `test "$1" = build && touch "\${5#--outfile=}"`);
  executable(
    "netlify",
    `
[[ " $* " == *' --no-build --dir public --functions functions --site ${gatewayId} --prod '* ]]
[[ " $* " == *'BGO_MCP_UPSTREAM_URL=${developmentApiAlias} '* && " $* " != *' --alias '* ]]
test -f functions/mcp.mjs
printf '%s' '{"site_id":"${gatewayId}","deploy_id":"${gatewayDeploy}"}'`,
  );
  const result = run(actionScript, [], {
    ...developmentEnv,
    BGO_NETLIFY_ISOLATED: "false",
    BGO_NETLIFY_COMPONENT: "mcp",
    GATEWAY_PR: "35",
    NETLIFY_BRANCH: "pr-35-123-1",
    API_URL: apiUrl,
    API_CLIENT_URL: developmentApiAlias,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(outputs(), `gateway-url=${gatewayOrigin}/mcp\n`);
  assert(requests().includes(`${gatewayOrigin}/.well-known/oauth-protected-resource/mcp`));
});

function stubProductionGit(executable) {
  executable(
    "git",
    `
case "$1" in fetch) exit 0 ;; rev-parse) printf '${prHead}' ;; *) exit 1 ;; esac`,
  );
}

test("Netlify Production API configures canonical CORS and MCP and verifies the advertised resource", (t) => {
  const { executable, run, requests, outputs } = fixture(t);
  stubProductionGit(executable);
  executable(
    "node",
    `test "$3" = production && test "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" = pk_live_fixture
printf 'https://issuer.clerk.test'`,
  );
  executable(
    "netlify",
    `
[[ " $* " == *' --filter apps/api --site ${apiId} '* && " $* " == *' --context production --prod '* ]]
[[ " $* " == *' --env BGO_NETLIFY_WEB_ORIGIN=${canonicalWeb} '* ]]
[[ " $* " == *' --env MCP_RESOURCE_URL=${canonicalApi}/mcp '* ]]
[[ " $* " == *' --env MCP_CLERK_ISSUER=https://issuer.clerk.test '* ]]
test "$BGO_NETLIFY_SITE_WEB_ORIGIN" = '${canonicalWeb}'
test -z "\${CLERK_SECRET_KEY:-}"
printf '%s' '{"site_id":"${apiId}","deploy_id":"${apiDeploy}"}'`,
  );
  const env = {
    ...productionEnv,
    BGO_NETLIFY_COMPONENT: "api",
    CLERK_SECRET_KEY: "sk_live_fixture",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture",
  };
  const invalid = run(actionScript, [], { ...env, OAUTH_RESOURCE: `${productionGateway}/mcp` });
  assert.notEqual(invalid.status, 0);
  assert.equal(outputs(), "");
  assert(!requests().includes(`${productionApiUrl}/api/admin/sync-user`));

  const result = run(actionScript, [], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    outputs(),
    `api-url=${productionApiUrl}\napi-client-url=${productionNetlifyApi}\nci-db-name=\n`,
  );
});

test("Netlify Production Web uses the canonical API and checks the exact published deploy", (t) => {
  const { executable, run, requests, outputs } = fixture(t);
  stubProductionGit(executable);
  executable(
    "netlify",
    `
[[ " $* " == *' --filter apps/web --site ${webId} '* && " $* " == *' --context production --prod '* ]]
test "$BGO_NETLIFY_API_ORIGIN" = '${canonicalApi}'
printf 'deploy command\n' >> "$REQUESTS"
printf '%s' '{"site_id":"${webId}","deploy_id":"${webDeploy}"}'`,
  );
  const env = {
    ...productionEnv,
    BGO_NETLIFY_COMPONENT: "web",
  };
  const superseded = run(actionScript, [], { ...env, PUBLISHED_API_DEPLOY: webDeploy });
  assert.notEqual(superseded.status, 0);
  assert.match(superseded.stderr, /requires a verified same-run api deployment/);
  assert(!requests().includes("deploy command"));

  const result = run(actionScript, [], env);
  assert.equal(result.status, 0, result.stderr);
  assert(requests().includes(`${productionApiUrl}/api/health`));
  assert.equal(
    outputs(),
    `web-url=https://${webDeploy}--bgo-web-production.netlify.app\nweb-client-url=https://bgo-web-production.netlify.app\n`,
  );
});

test("Netlify Production MCP probes the gateway for the canonical API OAuth resource", (t) => {
  const { executable, run, requests, outputs } = fixture(t);
  stubProductionGit(executable);
  executable("bun", `test "$1" = build && touch "\${5#--outfile=}"`);
  executable(
    "netlify",
    `
[[ " $* " == *' --no-build --dir public --functions functions --site ${gatewayId} --prod '* ]]
[[ " $* " == *'BGO_MCP_UPSTREAM_URL=${productionNetlifyApi} '* && " $* " != *' --alias '* ]]
printf '%s' '{"site_id":"${gatewayId}","deploy_id":"${gatewayDeploy}"}'`,
  );
  const env = { ...productionEnv, BGO_NETLIFY_COMPONENT: "mcp" };
  const invalid = run(actionScript, [], { ...env, OAUTH_RESOURCE: `${productionGateway}/mcp` });
  assert.notEqual(invalid.status, 0);
  assert.equal(outputs(), "");

  const result = run(actionScript, [], env);
  assert.equal(result.status, 0, result.stderr);
  assert(requests().includes(`${productionGateway}/.well-known/oauth-protected-resource/mcp`));
  assert.equal(outputs(), `gateway-url=${productionGateway}/mcp\n`);
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
