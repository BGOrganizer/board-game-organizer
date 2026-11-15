import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { format, parse as parseUrl } from "node:url";
import { runInNewContext } from "node:vm";
import hostedGitInfo from "hosted-git-info";
import { isNil } from "lodash-es";
import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/main-ci.yml", "utf8"));
const release = workflow.jobs.release;
const step = release.steps.find((entry) => entry.run === "bun run release");
const fakePat = "fake-release-pat";
const fakeActionsToken = "fake-actions-token";
const repository = "https://github.com/BGOrganizer/board-game-organizer.git";
const authenticated = `https://x-access-token:${fakePat}@github.com/BGOrganizer/board-game-organizer.git`;

// Execute the installed authentication resolver with only Git I/O replaced.
function resolver(verifyAuth) {
  const require = createRequire(import.meta.url);
  const path = require.resolve("semantic-release/lib/get-git-auth-url.js");
  const source = readFileSync(path, "utf8")
    .replace(/^import .*;$/gm, "")
    .replace("export default", "return");
  return runInNewContext(`(() => {${source}})()`, {
    format,
    parse: parseUrl,
    isNil,
    hostedGitInfo,
    debugAuthUrl: () => () => {},
    verifyAuth,
  });
}
function context(token) {
  return {
    cwd: process.cwd(),
    env: { GITHUB_ACTION: "release", GITHUB_TOKEN: token },
    branch: { name: "main" },
    options: { repositoryUrl: authenticated },
  };
}

test("only the validated release step receives the release PAT for authentication", () => {
  assert.equal(workflow.on.push.branches[0], "main");
  assert.equal(release.environment, "production");
  assert.equal(step.if, "steps.current.outputs.mode == 'prepare'");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression.
  assert.equal(step.env.GITHUB_TOKEN, "${{ secrets.RELEASE_PAT }}");
  assert.equal(step.env.SKIP_PUBLISH, "true");
  assert.equal(workflow.env?.GITHUB_TOKEN, undefined);
  assert.equal(release.env?.GITHUB_TOKEN, undefined);
  assert.equal(workflow.env?.GH_TOKEN, undefined);
  assert.equal(release.env?.GH_TOKEN, undefined);
  const credentials = release.steps.find((entry) => entry.env?.RELEASE_PAT);
  assert.equal(credentials.env.RELEASE_PAT, step.env.GITHUB_TOKEN);
  assert.match(credentials.run, /test -n "\$RELEASE_PAT"/);
  assert.match(credentials.run, /GH_TOKEN="\$RELEASE_PAT" gh api/);
  assert.match(credentials.run, /--jq '\.permissions\.admin'/);
  assert.match(credentials.run, /--unset-all http\.https:\/\/github\.com\/\.extraheader/);
});

test("successful remote authentication preserves the existing release identity", async () => {
  let calls = 0;
  const result = await resolver(async (url) => {
    calls++;
    assert.equal(url, authenticated);
  })(context(fakePat));
  assert.equal(result, authenticated);
  assert.equal(calls, 1);
});

test("authentication retry preserves the release identity after an initial Git probe failure", async () => {
  const result = await resolver(async () => {
    throw new Error("Simulated initial Git probe failure");
  })(context(fakePat));
  assert.equal(new URL(result).password, fakePat);
  assert(!result.includes(fakeActionsToken));
});

test("the old Actions-token fallback reproduces the credential divergence without a real push", async () => {
  const result = await resolver(async () => {
    throw new Error("Simulated initial Git probe failure");
  })(context(fakeActionsToken));
  assert.equal(new URL(result).password, fakeActionsToken);
  assert.equal(new URL(result).hostname, new URL(repository).hostname);
});
