import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  publishProductionRelease as publish,
  runProductionRelease,
  stageProductionRelease as stage,
} from "../main-release-publication.mjs";

const sha = "a".repeat(40),
  repository = "BGOrganizer/board-game-organizer",
  tag = "v1.4.0";
const bytes = Buffer.from("owned-verified-production-apk"),
  digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const owner = `<!-- bgo:production=${sha};version=1.4.0 -->`,
  apkName = "board-game-organizer-1.4.0-internal.apk";
const url = `https://github.com/${repository}/releases/tag/${tag}`;
function fixture() {
  const artifactDir = mkdtempSync(join(tmpdir(), "bgo-production-publish-"));
  for (const [name, value] of Object.entries({
    "test.apk": bytes,
    "apk.sha256": `${digest.slice(7)}  test.apk`,
    "source-head.txt": sha,
    "api-url.txt": "https://api.board-game-organizer.com",
    "update-channel.txt": "production",
  }))
    writeFileSync(join(artifactDir, name), value);
  return {
    input: {
      repository,
      token: "fixture-secret",
      sha,
      version: "1.4.0",
      notes: "# 1.4.0\n\nVerified notes",
      easUrl: "https://expo.dev/accounts/bgo-org/projects/bgo/builds/fixture",
      artifactDir,
    },
    cleanup: () => rmSync(artifactDir, { recursive: true, force: true }),
  };
}
function server(options = {}) {
  const expectedSha = options.sha ?? sha;
  const managedOwner = `<!-- bgo:production=${expectedSha};version=1.4.0 -->`;
  const writes = [],
    calls = [];
  const s = {
    release: options.release
      ? {
          id: 10,
          name: tag,
          tag_name: tag,
          target_commitish: expectedSha,
          prerelease: false,
          draft: true,
          body: `${managedOwner}\n\nOld private content`,
          html_url: url,
          ...options.release,
        }
      : undefined,
    assets: options.assets ?? [],
    mainReads: 0,
    tagSha: options.tagSha ?? expectedSha,
    fail: options.fail,
    badDigest: options.badDigest,
  };
  const request = async (address, init) => {
    const addressUrl = new URL(address),
      path = addressUrl.pathname,
      method = init.method;
    assert.equal(init.headers.Authorization, "Bearer fixture-secret");
    assert.equal(init.redirect, "error");
    assert(init.signal);
    calls.push({ address, method });
    if (method !== "GET")
      writes.push({
        path,
        method,
        body: init.body instanceof Blob ? "apk" : init.body && JSON.parse(init.body),
      });
    if (s.fail === `${method} ${path}`) return new Response(null, { status: 500 });
    if (path.endsWith("/git/ref/heads/main")) {
      s.mainReads++;
      return Response.json({
        object: {
          type: "commit",
          sha: options.staleAt && s.mainReads >= options.staleAt ? "b".repeat(40) : expectedSha,
        },
      });
    }
    if (path.endsWith(`/git/ref/tags/${tag}`))
      return Response.json({
        object: {
          type: options.annotated ? "tag" : "commit",
          sha: options.annotated ? "c".repeat(40) : s.tagSha,
        },
      });
    if (path.endsWith(`/git/tags/${"c".repeat(40)}`))
      return Response.json({ object: { type: "commit", sha: s.tagSha } });
    if (path.endsWith("/releases") && method === "GET") {
      if (options.paginated && addressUrl.searchParams.get("page") === "1")
        return Response.json(
          Array.from({ length: 100 }, (_, index) => ({ tag_name: `unrelated-${index}` })),
        );
      return Response.json(s.release ? [s.release] : []);
    }
    if (path.endsWith("/releases") && method === "POST") {
      s.release = { id: 10, ...JSON.parse(init.body), html_url: url, ...options.created };
      return Response.json(s.release);
    }
    if (path.endsWith("/releases/10/assets") && method === "GET") return Response.json(s.assets);
    if (addressUrl.hostname === "uploads.github.com" && method === "POST") {
      assert.deepEqual(Buffer.from(await init.body.arrayBuffer()), bytes);
      const value = {
        id: 20,
        name: addressUrl.searchParams.get("name"),
        size: bytes.length,
        digest: s.badDigest ? "sha256:wrong" : digest,
        state: "uploaded",
      };
      s.assets.push(value);
      return Response.json(value);
    }
    if (path.endsWith("/releases/10") && method === "GET") return Response.json(s.release);
    if (path.endsWith("/releases/10") && method === "PATCH") {
      Object.assign(s.release, JSON.parse(init.body));
      if (!s.release.draft) s.release.html_url = url;
      return Response.json(s.release);
    }
    if (/\/releases\/assets\/\d+$/.test(path) && method === "DELETE") {
      s.assets = s.assets.filter((asset) => String(asset.id) !== path.split("/").at(-1));
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected mock request ${method} ${address}`);
  };
  return { request, writes, calls, state: s };
}
function ownedAsset(extra = {}) {
  return { id: 20, name: apkName, size: bytes.length, digest, state: "uploaded", ...extra };
}

test("stages notes, links and checksummed APK privately; publish and retries reuse the same release", async () => {
  const f = fixture(),
    github = server();
  try {
    const prepared = await stage(f.input, github.request);
    assert.equal(prepared.already_published, false);
    assert.equal(github.state.release.draft, true);
    assert.match(github.state.release.body, /Verified notes/);
    assert.match(github.state.release.body, /Build EAS/);
    assert.deepEqual(
      github.writes.map((row) => row.method),
      ["POST", "POST"],
    );
    const before = github.writes.length;
    assert.deepEqual(await stage(f.input, github.request), prepared);
    assert.equal(github.writes.length, before);
    assert.deepEqual(await publish(f.input, prepared, github.request), { release_url: url });
    assert.equal(github.state.release.draft, false);
    const publishedWrites = github.writes.length;
    assert.equal((await stage(f.input, github.request)).already_published, true);
    assert.deepEqual(await publish(f.input, prepared, github.request), { release_url: url });
    assert.equal(github.writes.length, publishedWrites);
  } finally {
    f.cleanup();
  }
});
test("recovers an owned interrupted private draft and replaces only its mismatched APK before OTA", async () => {
  const f = fixture(),
    github = server({
      release: {},
      assets: [ownedAsset({ digest: "sha256:old" }), { id: 99, name: "unrelated.txt" }],
    });
  try {
    await stage(f.input, github.request);
    assert.deepEqual(
      github.writes.map((row) => row.method),
      ["DELETE", "POST", "PATCH"],
    );
    assert.equal(github.state.release.draft, true);
    assert.equal(github.state.assets.find((row) => row.id === 99)?.name, "unrelated.txt");
    assert.equal(github.state.assets.find((row) => row.name === apkName)?.digest, digest);
  } finally {
    f.cleanup();
  }
});
test("finds owned drafts beyond the first page and accepts an annotated matching tag", async () => {
  const f = fixture(),
    github = server({ release: {}, assets: [ownedAsset()], paginated: true, annotated: true });
  try {
    await stage(f.input, github.request);
    assert(github.calls.some((row) => row.address.includes("page=2")));
    assert.equal(github.writes.filter((row) => row.method === "POST").length, 0);
  } finally {
    f.cleanup();
  }
});
for (const [name, release] of [
  ["foreign owner", { body: "Foreign content" }],
  ["foreign target", { target_commitish: "b".repeat(40) }],
  ["foreign name", { name: "Unrelated" }],
  ["prerelease", { prerelease: true }],
  ["invalid ID", { id: 0 }],
])
  test(`refuses ${name} without mutations`, async () => {
    const f = fixture(),
      github = server({ release });
    try {
      await assert.rejects(stage(f.input, github.request), /unrelated/);
      assert.deepEqual(github.writes, []);
    } finally {
      f.cleanup();
    }
  });
test("never replaces a published APK or published notes with different content", async () => {
  const f = fixture();
  try {
    for (const assets of [[ownedAsset({ digest: "sha256:wrong" })], [ownedAsset()]]) {
      const github = server({ release: { draft: false }, assets });
      await assert.rejects(stage(f.input, github.request), /differs/);
      assert.deepEqual(github.writes, []);
    }
  } finally {
    f.cleanup();
  }
});
test("stale Main or changed tags refuse publication, including stale state after private staging", async () => {
  const f = fixture();
  try {
    for (const options of [{ staleAt: 1 }, { staleAt: 2 }, { tagSha: "b".repeat(40) }]) {
      const github = server(options);
      await assert.rejects(stage(f.input, github.request), /superseded/);
      assert.deepEqual(github.writes, []);
    }
    const github = server();
    const prepared = await stage(f.input, github.request),
      count = github.writes.length;
    github.state.tagSha = "b".repeat(40);
    await assert.rejects(publish(f.input, prepared, github.request), /superseded/);
    assert.equal(github.writes.length, count);
    assert.equal(github.state.release.draft, true);
  } finally {
    f.cleanup();
  }
});
test("failed upload receipts keep the release private and an explicit retry can recover", async () => {
  const f = fixture(),
    github = server({ badDigest: true });
  try {
    await assert.rejects(stage(f.input, github.request), /receipt mismatch/);
    assert.equal(github.state.release.draft, true);
    github.state.badDigest = false;
    const prepared = await stage(f.input, github.request);
    assert.equal(prepared.already_published, false);
    github.state.assets[0].digest = "sha256:tampered";
    await assert.rejects(publish(f.input, prepared, github.request), /incomplete/);
    assert.equal(github.state.release.draft, true);
  } finally {
    f.cleanup();
  }
});
test("API errors and malformed creation receipts never proceed to a public release", async () => {
  const f = fixture();
  try {
    for (const github of [
      server({ fail: `POST /repos/${repository}/releases` }),
      server({ created: { draft: false } }),
    ]) {
      await assert.rejects(stage(f.input, github.request));
      assert(!github.writes.some((row) => row.body?.draft === false));
    }
  } finally {
    f.cleanup();
  }
});
for (const [name, extra] of [
  ["wrong source", { sha: "invalid" }],
  ["wrong repository", { repository: "owner/repo/extra" }],
  ["missing token", { token: "" }],
  ["empty notes", { notes: "" }],
  ["untrusted EAS URL", { easUrl: "https://example.test/build" }],
  ["credential-bearing EAS URL", { easUrl: "https://user:secret@expo.dev/build" }],
])
  test(`rejects ${name} before requests`, async () => {
    const f = fixture();
    try {
      await assert.rejects(
        stage({ ...f.input, ...extra }, async () => {
          assert.fail("Unexpected provider request");
        }),
      );
    } finally {
      f.cleanup();
    }
  });
for (const [file, value] of [
  ["source-head.txt", "wrong"],
  ["api-url.txt", "https://preview.example.test"],
  ["update-channel.txt", "development"],
  ["apk.sha256", `${"f".repeat(64)}  test.apk`],
])
  test(`rejects changed artifact ${file} before requests`, async () => {
    const f = fixture();
    try {
      writeFileSync(join(f.input.artifactDir, file), value);
      await assert.rejects(
        stage(f.input, async () => {
          assert.fail("Unexpected provider request");
        }),
      );
    } finally {
      f.cleanup();
    }
  });

test("CLI command stages and publishes the same verified artifact and emits bounded outputs", async () => {
  const helper = resolve(".github/scripts/main-release-publication.mjs"),
    f = fixture(),
    github = server();
  try {
    const env = {
      GITHUB_REPOSITORY: repository,
      GH_TOKEN: f.input.token,
      RELEASE_SHA: sha,
      VERSION: f.input.version,
      ARTIFACT_DIR: f.input.artifactDir,
      EAS_BUILD_URL: f.input.easUrl,
      RELEASE_STATE_FILE: join(f.input.artifactDir, "state.json"),
      GITHUB_OUTPUT: join(f.input.artifactDir, "outputs.txt"),
    };
    const options = {
      request: github.request,
      execute: (command, args) => {
        assert.equal(command, "git");
        return args[0] === "rev-parse" ? sha : f.input.notes;
      },
    };
    await runProductionRelease("stage", env, options);
    await runProductionRelease("publish", env, options);
    await assert.rejects(runProductionRelease("invalid", env, options), /stage or publish/);
    await assert.rejects(
      runProductionRelease("stage", { ...env, RELEASE_SHA: "b".repeat(40) }, options),
      /checkout/,
    );
    assert.equal(github.state.release.draft, false);
    assert.match(readFileSync(env.GITHUB_OUTPUT, "utf8"), /already_published=false/);
    assert.match(readFileSync(env.GITHUB_OUTPUT, "utf8"), /release_url=https:\/\/github.com/);
    const invalid = spawnSync(process.execPath, [helper, "invalid"], { encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /refused/);
  } finally {
    f.cleanup();
  }
});

test("private staging accepts GitHub's untagged draft URL and verifies the canonical public URL after publish", async () => {
  const f = fixture(),
    github = server({
      created: { html_url: `https://github.com/${repository}/releases/tag/untagged-d87c49` },
    });
  try {
    const prepared = await stage(f.input, github.request);
    assert.equal(github.state.release.draft, true);
    assert.match(github.state.release.html_url, /untagged-/);
    assert.equal((await publish(f.input, prepared, github.request)).release_url, url);
  } finally {
    f.cleanup();
  }
});
