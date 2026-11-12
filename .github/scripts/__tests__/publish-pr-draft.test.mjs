import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { publishDevelopmentDraft } from "../publish-pr-draft.mjs";

const sha = "a".repeat(40),
  repository = "BGOrganizer/board-game-organizer";
const dir = mkdtempSync(join(tmpdir(), "bgo-draft-test-"));
const apk = join(dir, "test.apk"),
  bytes = Buffer.from("unit-test-apk");
writeFileSync(apk, bytes);
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const input = {
  repository,
  number: 22,
  headSha: sha,
  token: "private-unit-token",
  title: 'PR "$(do-not-execute)" | &',
  version: "1.3.2",
  apkName: "bgo-development.apk",
  apkPath: apk,
  runId: 100,
  attempt: 2,
  webUrl: "https://development-web.vercel.app",
  apiUrl: "https://development-api.vercel.app",
  easUrl: "",
  changelog: "Changes",
};
function github(options = {}) {
  const calls = [],
    writes = [];
  let reads = 0;
  const release = {
    id: 10,
    draft: true,
    name: "board-game-organizer-v1.3.2-pr.22",
    html_url: `https://github.com/${repository}/releases/tag/draft`,
    ...options.release,
  };
  const asset = {
    id: 20,
    name: `bgo-development-${sha.slice(0, 12)}-100-2.apk`,
    size: bytes.length,
    digest,
    browser_download_url: `https://github.com/${repository}/releases/download/draft/apk.apk`,
    ...options.asset,
  };
  const run = {
    id: 100,
    run_attempt: 2,
    run_number: 5,
    status: "in_progress",
    event: "pull_request",
    path: ".github/workflows/pr-ci.yml",
    head_sha: sha,
    head_branch: "feat/topic",
    head_repository: { full_name: repository },
    pull_requests: [{ number: 22 }],
  };
  const old = options.assets ?? [
    { id: 9, name: "bgo-development-old.apk" },
    { id: 8, name: "notes.txt" },
    { id: 7, name: "unrelated.apk" },
  ];
  return {
    calls,
    writes,
    request: async (url, init = {}) => {
      const method = init.method ?? "GET";
      calls.push({ url, method });
      assert.equal(init.headers.Authorization, "Bearer private-unit-token");
      if (url.endsWith("/pulls/22")) {
        reads++;
        return Response.json({
          state: "open",
          base: { ref: "main" },
          head: {
            ref: "feat/topic",
            repo: { full_name: repository },
            sha: options.staleAt && reads >= options.staleAt ? "b".repeat(40) : sha,
          },
        });
      }
      if (url.endsWith("/actions/runs/100")) return Response.json(run);
      if (url.includes("/actions/workflows/pr-ci.yml/runs?"))
        return Response.json({ workflow_runs: [run] });
      if (method !== "GET")
        writes.push({
          url,
          method,
          body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
        });
      if (options.fail === method)
        return new Response("private-token-must-not-be-logged", { status: 500 });
      if (/\/releases\?/.test(url))
        return Response.json(
          options.absent
            ? []
            : options.pages && url.endsWith("page=1")
              ? Array.from({ length: 100 }, (_, id) => ({ name: `other-${id}` }))
              : [release],
        );
      if (url.endsWith("/releases") && method === "POST")
        return Response.json(release, { status: 201 });
      if (/\/releases\/10\/assets\?/.test(url) && method === "GET") return Response.json(old);
      if (url.startsWith("https://uploads.github.com/")) {
        assert.equal(Buffer.from(await init.body.arrayBuffer()).toString(), bytes.toString());
        return Response.json(asset, { status: 201 });
      }
      if (method === "PATCH") return Response.json(release);
      if (method === "DELETE") return new Response(null, { status: 204 });
      throw new Error(`Unexpected unit HTTP request ${method} ${url}`);
    },
  };
}
test("Development release uploads verified revision first, links only Development, then removes only captured owned APKs", async () => {
  const fake = github();
  const result = await publishDevelopmentDraft(input, fake.request);
  const upload = fake.writes.findIndex((r) => r.url.startsWith("https://uploads.github.com"));
  const patch = fake.writes.findIndex((r) => r.method === "PATCH");
  const deletion = fake.writes.findIndex((r) => r.method === "DELETE");
  assert(upload >= 0 && patch > upload && deletion > patch);
  const body = fake.writes[patch].body.body;
  assert.match(body, /Development preview disponibile/);
  assert.match(body, /non certifica/);
  assert(body.includes(input.title));
  assert(body.includes(input.headSha));
  assert(body.includes(input.webUrl));
  assert(body.includes(input.apiUrl));
  assert(!body.includes("PR CI/CD completato"));
  assert(!body.includes("EAS:"));
  assert.equal(fake.writes.filter((r) => r.method === "DELETE").length, 1);
  assert(fake.writes[deletion].url.endsWith("/9"));
  assert.equal(result.release_id, 10);
  assert.match(result.apk_url, /^https:\/\/github.com\//);
});
test("creates a missing draft and includes a valid optional EAS URL", async () => {
  const fake = github({ absent: true });
  await publishDevelopmentDraft(
    { ...input, easUrl: "https://expo.dev/builds/verified" },
    fake.request,
  );
  const create = fake.writes.find((r) => r.url.endsWith("/releases") && r.method === "POST");
  assert.equal(create.body.target_commitish, sha);
  assert.equal(create.body.draft, true);
  assert(
    fake.writes
      .find((r) => r.method === "PATCH")
      .body.body.includes("https://expo.dev/builds/verified"),
  );
});
test("does not overwrite a published release or remove the previous APK on a stale head, failed upload or invalid receipt", async () => {
  for (const options of [
    { release: { draft: false } },
    { staleAt: 2 },
    { staleAt: 3 },
    { fail: "POST" },
    { asset: { digest: "wrong" } },
    { asset: { size: 1 } },
    { asset: { id: "bad" } },
    { asset: { browser_download_url: "http://github.com/unsafe" } },
  ]) {
    const fake = github(options);
    await assert.rejects(publishDevelopmentDraft(input, fake.request));
    assert(!fake.writes.some((r) => r.method === "DELETE"));
    assert(!fake.writes.some((r) => r.method === "PATCH"));
  }
  const afterPatch = github({ staleAt: 4 });
  await assert.rejects(publishDevelopmentDraft(input, afterPatch.request), /superseded/);
  assert(afterPatch.writes.some((r) => r.method === "PATCH"));
  assert(!afterPatch.writes.some((r) => r.method === "DELETE"));
});
test("handles release pagination, validates new release receipts, and retires prior timestamped Development names only", async () => {
  const fake = github({
    pages: true,
    assets: [
      { id: 9, name: "board-game-organizer-1.3.2-20260101000000-development.apk" },
      { id: 7, name: "manual.apk" },
    ],
  });
  await publishDevelopmentDraft(
    { ...input, apkName: "board-game-organizer-1.3.2-20260201000000-development.apk" },
    fake.request,
  );
  assert(fake.calls.some((r) => r.url.endsWith("page=2")));
  assert.equal(fake.writes.filter((r) => r.method === "DELETE").length, 1);
  assert(fake.writes.some((r) => r.method === "DELETE" && r.url.endsWith("/9")));
  await assert.rejects(
    publishDevelopmentDraft(input, github({ absent: true, release: { id: "bad" } }).request),
    /receipt/,
  );
  await assert.rejects(
    publishDevelopmentDraft(
      input,
      github({ asset: { browser_download_url: "https://other.example/apk" } }).request,
    ),
    /URL/,
  );
});

test("reuses only an exact verified run/revision upload, without a duplicate upload", async () => {
  const asset = {
    id: 20,
    name: `bgo-development-${sha.slice(0, 12)}-100-2.apk`,
    size: bytes.length,
    digest,
    browser_download_url: `https://github.com/${repository}/releases/download/draft/apk.apk`,
  };
  const fake = github({ assets: [asset] });
  await publishDevelopmentDraft(input, fake.request);
  assert(!fake.writes.some((r) => r.url.startsWith("https://uploads.github.com")));
  assert(!fake.writes.some((r) => r.method === "DELETE"));
});
test("rejects invalid identities, URLs and empty artifacts before mutating GitHub", async () => {
  const empty = join(dir, "empty.apk");
  writeFileSync(empty, "");
  for (const change of [
    { version: "bad" },
    { apkName: "../unsafe.apk" },
    { apkName: `${"a".repeat(181)}.apk` },
    { runId: 0 },
    { attempt: 0 },
    { title: "" },
    { title: "x".repeat(257) },
    { webUrl: "http://development.vercel.app" },
    { apiUrl: "https://production.example" },
    { easUrl: "http://expo.dev/bad" },
    { apkPath: empty },
    { webUrl: "https://user:pass@development.vercel.app" },
  ]) {
    const fake = github();
    await assert.rejects(publishDevelopmentDraft({ ...input, ...change }, fake.request));
    assert.equal(fake.writes.length, 0);
  }
});
test("release and notification actions pass untrusted fields as environment data, never shell source", () => {
  for (const name of ["publish-draft-release", "telegram-notify"]) {
    const action = parse(readFileSync(`.github/actions/${name}/action.yml`, "utf8"));
    for (const step of action.runs.steps) assert(!/\$\{\{\s*inputs\./.test(step.run ?? ""));
  }
});
