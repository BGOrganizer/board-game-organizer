import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import {
  attestManualApi,
  manualApiTarget,
  requireClerkTarget,
  verifyPreviewProject,
} from "./manual-target.mjs";

const preview = "https://api-owned-123.vercel.app";
test("manual API targets reject foreign, CI-agnostic URL tricks and implicit environment changes", () => {
  assert.equal(manualApiTarget("preview", preview + "/"), preview);
  assert.equal(manualApiTarget("production", ""), "https://api.board-game-organizer.com");
  for (const target of ["preview", "production"])
    for (const url of [
      "http://api-owned-123.vercel.app",
      "https://user:secret@api-owned-123.vercel.app",
      "https://api-owned-123.vercel.app:8443",
      preview + "/api",
      preview + "?secret=value",
      preview + "#hash",
      "https://evil.example",
      "not-url",
    ])
      assert.throws(() => manualApiTarget(target, url));
  assert.throws(() => manualApiTarget("preview", ""));
  assert.throws(() => manualApiTarget("preview", "https://api.board-game-organizer.com"));
  assert.throws(() => manualApiTarget("production", preview));
  assert.throws(() => manualApiTarget("other", preview));
});
test("matching Clerk keys are mandatory, never a Production-to-Preview fallback", () => {
  for (const target of ["preview", "production"])
    for (const kind of ["pk", "sk"]) {
      const prefix = `${kind}_${target === "production" ? "live" : "test"}_`;
      assert.equal(requireClerkTarget(target, prefix + "fixture", kind), prefix + "fixture");
      for (const value of [
        "",
        undefined,
        prefix,
        `${kind}_${target === "production" ? "test" : "live"}_fixture`,
      ])
        assert.throws(() => requireClerkTarget(target, value, kind));
    }
  assert.throws(() => requireClerkTarget("invalid", "pk_test_fixture", "pk"));
  assert.throws(() => requireClerkTarget("preview", "pk_test_fixture", "other"));
});
test("only a READY deployment in the owned API project receives application credentials later", async () => {
  const config = { token: "unit-vercel-token", team: "team", project: "api-project" };
  const deployment = {
    url: new URL(preview).hostname,
    projectId: config.project,
    target: null,
    readyState: "READY",
  };
  await verifyPreviewProject(preview, config, async (url, options) => {
    assert(url.startsWith("https://api.vercel.com/v13/deployments/"));
    assert.equal(options.headers.Authorization, "Bearer unit-vercel-token");
    assert.equal(options.redirect, "error");
    return Response.json(deployment);
  });
  for (const change of [
    { url: "other.vercel.app" },
    { projectId: "other-project" },
    { target: "production" },
    { readyState: "ERROR" },
  ])
    await assert.rejects(
      verifyPreviewProject(preview, config, async () =>
        Response.json({ ...deployment, ...change }),
      ),
    );
  for (const change of [{ token: "" }, { team: "" }, { project: "" }])
    await assert.rejects(
      verifyPreviewProject(preview, { ...config, ...change }, async () => {
        throw Error("Must not fetch");
      }),
    );
  await assert.rejects(
    verifyPreviewProject(
      preview,
      config,
      async () => new Response("private body", { status: 403 }),
    ),
    /403/,
  );
});
test("runtime attestation binds each Clerk secret, encodes Preview bypass and refuses CI databases", async () => {
  const db = { databaseName: "catalog", webhookDatabaseName: "catalog", webhookDbReady: true };
  for (const target of ["preview", "production"]) {
    const api = manualApiTarget(target, target === "preview" ? preview : "");
    const secret = `sk_${target === "production" ? "live" : "test"}_fixture`;
    await attestManualApi(target, api, secret, "private&bypass", async (url, options) => {
      const value = new URL(url);
      assert.equal(value.pathname, "/api/admin/sync-user");
      assert.equal(
        value.searchParams.get("x-vercel-protection-bypass"),
        target === "preview" ? "private&bypass" : null,
      );
      assert.equal(options.headers.Authorization, `Bearer ${secret}`);
      assert.equal(options.redirect, "error");
      return Response.json(db);
    });
    for (const change of [
      { databaseName: "bgo_ci_123_1" },
      { databaseName: "" },
      { databaseName: null },
      { webhookDbReady: false },
      { webhookDatabaseName: "other" },
    ])
      await assert.rejects(
        attestManualApi(target, api, secret, "bypass", async () =>
          Response.json({ ...db, ...change }),
        ),
      );
  }
  await assert.rejects(
    attestManualApi("preview", preview, "sk_test_fixture", "", async () => {
      throw Error("No request");
    }),
    /bypass/,
  );
  await assert.rejects(
    attestManualApi(
      "preview",
      preview,
      "sk_test_fixture",
      "bypass",
      async () => new Response("private body", { status: 401 }),
    ),
    /401/,
  );
});
test("manual mobile matches PR Development build inputs and cannot attach a Preview to a Production release", () => {
  const mobile = parse(readFileSync(".github/workflows/mobile-development.yml", "utf8"));
  const pr = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8"));
  assert.deepEqual(mobile.on.workflow_dispatch.inputs.target.options, ["preview", "production"]);
  const job = mobile.jobs["build-development"];
  assert.equal(job.if, "github.ref == 'refs/heads/main'");
  assert.equal(job["timeout-minutes"], 180);
  assert(job.environment.includes("production"));
  const step = job.steps.find((s) => s.uses === "./.github/actions/mobile-build");
  const current = pr.jobs["build-mobile-development"].steps.find(
    (s) => s.uses === "./.github/actions/mobile-build",
  );
  for (const input of [
    "profile",
    "expo-token",
    "maptiler-api-key",
    "sentry-dsn",
    "google-services-json",
  ])
    assert.equal(step.with[input], current.with[input]);
  const gate = job.steps.find((s) => s.id === "target");
  assert.equal(gate.env.CLERK_PUBLISHABLE_KEY, step.with["clerk-publishable-key"]);
  assert.match(gate.env.CLERK_SECRET_KEY, /^\$\{\{ secrets\[/);
  assert.equal(step.with["api-url"], "${{ steps.target.outputs.api-url }}");
  assert(!JSON.stringify(job).includes("releases?per_page=1"));
  assert(
    job.steps.some(
      (s) => s.uses === "actions/upload-artifact@v4" && s.with["if-no-files-found"] === "error",
    ),
  );
  assert.equal(existsSync(".github/workflows/mobile-e2e.yml"), false);
});
test("BGG workflow uses the real shared parser, safe target selection and existing resumable API importer", () => {
  const workflow = parse(readFileSync(".github/workflows/import-boardgames.yml", "utf8"));
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.target.options, ["preview", "production"]);
  const job = workflow.jobs.import;
  assert(job.environment.includes("production"));
  const gate = job.steps.find((s) => s.env?.TARGET);
  const execute = job.steps.find((s) => s.env?.BGG_CSV);
  assert.equal(gate.env.CLERK_SECRET_KEY, execute.env.BGG_IMPORT_TOKEN);
  assert.match(execute.env.BGG_IMPORT_TOKEN, /^\$\{\{ secrets\[/);
  assert.equal(execute.run, "node apps/api/scripts/import-boardgames.mjs");
  assert(!job.steps.some((s) => /head -c|grep -q/.test(s.run || "")));
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  for (const file of [
    "apps/api/scripts/import-boardgames.mjs",
    "apps/api/scripts/import-boardgames-direct.ts",
  ])
    assert(readFileSync(file, "utf8").includes("parseBoardGamesCsv"));
});
