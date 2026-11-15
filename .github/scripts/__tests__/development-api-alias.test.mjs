import assert from "node:assert/strict";
import test from "node:test";
import { activateDevelopmentApi, developmentApiUrl } from "../development-api-alias.mjs";

const sourceSha = "a".repeat(40);
const options = {
  apiUrl: "https://api-immutable.vercel.app",
  webUrl: "https://web-immutable.vercel.app",
  apiProjectId: "prj_api",
  webProjectId: "prj_web",
  token: "private-vercel",
  orgId: "team_owned",
  bypass: "private bypass&token",
  clerkKey: "sk_test_private",
  sourceSha,
  branch: "feature/owned",
  pr: { number: "22" },
};
function fixture(fault) {
  const calls = [];
  let aliasReads = 0;
  return {
    calls,
    dependencies: {
      command(args) {
        calls.push(args);
        assert.deepEqual(args.slice(-2), ["--token", "private-vercel"]);
        assert.deepEqual(args.slice(-4, -2), ["--scope", "team_owned"]);
        if (args[0] === "alias") return "";
        if (args[0] === "inspect") {
          if (args[1] === developmentApiUrl("22")) {
            aliasReads++;
            if (fault === "read-error") throw new Error("temporary provider lookup failure");
            return JSON.stringify({
              id: fault === "alias" || aliasReads === 1 ? "dpl_other" : "dpl_api",
              readyState: "READY",
            });
          }
          return JSON.stringify({
            id: args[1] === options.apiUrl ? "dpl_api" : "dpl_web",
            readyState: fault === "not-ready" ? "BUILDING" : "READY",
          });
        }
        const api = args[1].endsWith("dpl_api");
        return JSON.stringify({
          id: api ? "dpl_api" : "dpl_web",
          ...(fault === "nested-project"
            ? { project: { id: api ? "prj_api" : "prj_web" } }
            : { projectId: fault === "project" ? "prj_other" : api ? "prj_api" : "prj_web" }),
          meta: {
            githubCommitRef: fault === "branch" ? "main" : options.branch,
            githubCommitSha: fault === "source" ? "b".repeat(40) : sourceSha,
          },
        });
      },
      async request(rawUrl, init) {
        const url = new URL(rawUrl);
        calls.push(["get", url.origin + url.pathname]);
        assert.equal(url.searchParams.get("x-vercel-protection-bypass"), options.bypass);
        assert.equal(init.redirect, "error");
        if (fault === "smoke") return new Response("failure", { status: 503 });
        if (url.pathname.endsWith("sync-user")) {
          assert.equal(init.headers.Authorization, `Bearer ${options.clerkKey}`);
          return Response.json({
            webhookDbReady: fault !== "webhook",
            databaseName: fault === "ci-db" ? "bgo_ci_42_1" : "development-db",
            webhookDatabaseName: "development-db",
          });
        }
        assert.equal(init.headers, undefined);
        return Response.json({ ok: true });
      },
      async current() {
        calls.push(["current"]);
        if (fault === "superseded") throw new Error("PR superseded");
      },
      async pause() {},
    },
  };
}

test("Development client URL is stable per PR and cannot name a CI/production destination", () => {
  assert.equal(
    developmentApiUrl("22"),
    "https://api-development-pr-22-board-game-organizers-projects.vercel.app",
  );
  for (const value of ["", "0", "01", "22\nGH_TOKEN=private", "main", "22.vercel.app"])
    assert.throws(() => developmentApiUrl(value));
});

test("alias activation follows immutable project/source verification, smoke, non-CI attestation and current PR", async () => {
  const { calls, dependencies } = fixture();
  assert.equal(await activateDevelopmentApi(options, dependencies), developmentApiUrl("22"));
  const aliasIndex = calls.findIndex((args) => args[0] === "alias");
  assert.deepEqual(calls[aliasIndex - 1], ["current"]);
  assert.deepEqual(calls[aliasIndex].slice(0, 4), [
    "alias",
    "set",
    options.apiUrl,
    new URL(developmentApiUrl("22")).hostname,
  ]);
  assert(
    calls
      .slice(0, aliasIndex)
      .some((args) => args[0] === "get" && args[1] === `${options.apiUrl}/api/admin/sync-user`),
  );
  assert.deepEqual(calls.at(-1), ["get", `${developmentApiUrl("22")}/api/admin/sync-user`]);
});

test("authenticated deployment metadata can identify its project through project.id", async () => {
  const { dependencies } = fixture("nested-project");
  assert.equal(await activateDevelopmentApi(options, dependencies), developmentApiUrl("22"));
});

for (const fault of [
  "project",
  "branch",
  "source",
  "not-ready",
  "smoke",
  "ci-db",
  "webhook",
  "superseded",
])
  test(`alias is never assigned after failed ${fault} gate`, async () => {
    const { calls, dependencies } = fixture(fault);
    await assert.rejects(activateDevelopmentApi(options, dependencies));
    assert(!calls.some((args) => args[0] === "alias"));
  });

for (const fault of ["alias", "read-error"])
  test(`wrong or unavailable alias target ${fault} fails after bounded retries`, async () => {
    const { calls, dependencies } = fixture(fault);
    await assert.rejects(activateDevelopmentApi(options, dependencies), /did not resolve/);
    assert.equal(
      calls.filter((args) => args[0] === "inspect" && args[1] === developmentApiUrl("22")).length,
      20,
    );
  });

test("production, credentials in URLs, paths and invalid source inputs fail before provider access", async () => {
  for (const change of [
    { apiUrl: "https://api.board-game-organizer.com" },
    { webUrl: "https://user:private@web.vercel.app" },
    { apiUrl: `${options.apiUrl}/path` },
    { apiUrl: `${options.apiUrl}?bypass=private` },
    { clerkKey: "sk_live_private" },
    { sourceSha: "invalid" },
    { bypass: "" },
    { orgId: "" },
  ]) {
    const { calls, dependencies } = fixture();
    await assert.rejects(activateDevelopmentApi({ ...options, ...change }, dependencies));
    assert.equal(calls.length, 0);
  }
});
