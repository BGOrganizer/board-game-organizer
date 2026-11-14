import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  createReadStream,
  openAsBlob,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function publication(input, request) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(input.repository ?? "") ||
    !/^[a-f0-9]{40}$/.test(input.sha ?? "") ||
    !/^\d+\.\d+\.\d+$/.test(input.version ?? "") ||
    !input.token ||
    !input.notes?.trim()
  )
    throw new Error("Pinned Production release identity required");
  if (input.easUrl) {
    const url = new URL(input.easUrl);
    if (url.protocol !== "https:" || url.hostname !== "expo.dev" || url.username || url.password)
      throw new Error("Verified EAS URL required");
  }
  const api = `https://api.github.com/repos/${input.repository}`;
  const tag = `v${input.version}`,
    owner = `<!-- bgo:production=${input.sha};version=${input.version} -->`;
  const body = [
    owner,
    input.notes.trim(),
    "## 🚀 Production",
    "- **Web:** https://board-game-organizer.com",
    "- **API:** https://api.board-game-organizer.com",
    "- **APK:** allegato alla release",
    ...(input.easUrl ? [`- **Build EAS:** ${input.easUrl}`] : []),
  ].join("\n\n");
  async function call(path, method = "GET", value, upload = false) {
    const response = await request(path.startsWith("https://") ? path : `${api}${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(upload ? 600_000 : 30_000),
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/vnd.github+json",
        ...(value
          ? {
              "Content-Type": upload
                ? "application/vnd.android.package-archive"
                : "application/json",
            }
          : {}),
      },
      ...(value ? { body: upload ? value : JSON.stringify(value) } : {}),
    });
    if (!response.ok) throw new Error(`Production release request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  }
  async function current() {
    const main = await call("/git/ref/heads/main"),
      version = await call(`/git/ref/tags/${tag}`);
    const target =
      version.object?.type === "tag"
        ? (await call(`/git/tags/${version.object.sha}`)).object
        : version.object;
    if (main.object?.sha !== input.sha || target?.type !== "commit" || target?.sha !== input.sha)
      throw new Error("Production release was superseded or its tag changed");
  }
  function owned(release) {
    if (
      !Number.isSafeInteger(release?.id) ||
      release.id < 1 ||
      release.tag_name !== tag ||
      release.name !== tag ||
      release.target_commitish !== input.sha ||
      release.prerelease !== false ||
      typeof release.draft !== "boolean" ||
      !release.body?.startsWith(`${owner}\n\n`)
    )
      throw new Error("Refusing an unrelated Production release");
    return release;
  }
  const url = (release) => {
    const expected = `https://github.com/${input.repository}/releases/tag/${tag}`;
    if (!release.draft && release.html_url !== expected)
      throw new Error("Invalid Production release URL");
    return expected;
  };
  return { api, tag, owner, body, call, current, owned, url };
}

async function artifact(input) {
  const dir = resolve(input.artifactDir),
    read = (file) => readFileSync(join(dir, file), "utf8").trim();
  const names = readdirSync(dir).filter((name) => name.endsWith(".apk"));
  const checksum = read("apk.sha256").match(/^([a-f0-9]{64}) [ *]([^/\\]+\.apk)$/);
  if (
    names.length !== 1 ||
    !checksum ||
    checksum[2] !== names[0] ||
    read("source-head.txt") !== input.sha ||
    read("api-url.txt") !== "https://api.board-game-organizer.com" ||
    read("update-channel.txt") !== "production"
  )
    throw new Error("Verified Production APK provenance required");
  const path = join(dir, names[0]),
    size = statSync(path).size,
    hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const digest = `sha256:${hash.digest("hex")}`;
  if (!size || digest !== `sha256:${checksum[1]}`)
    throw new Error("Production APK checksum mismatch");
  return { path, size, digest, name: `board-game-organizer-${input.version}-internal.apk` };
}
function matches(asset, expected) {
  return (
    Number.isSafeInteger(asset?.id) &&
    asset.id > 0 &&
    asset.name === expected.name &&
    asset.size === expected.size &&
    asset.digest === expected.digest &&
    asset.state === "uploaded"
  );
}
function sameNotes(release, expected) {
  return (
    release.body.replace(/^- \*\*Build EAS:\*\* .+\n?/gm, "").trim() ===
    expected.replace(/^- \*\*Build EAS:\*\* .+\n?/gm, "").trim()
  );
}

/** Keep this release private until its owned APK, notes and links are verified, before OTA. */
export async function stageProductionRelease(input, request = fetch) {
  const p = publication(input, request),
    apk = await artifact(input);
  await p.current();
  let release;
  for (let page = 1; !release; page++) {
    const rows = await p.call(`/releases?per_page=100&page=${page}`);
    release = rows.find((row) => row.tag_name === p.tag);
    if (release || rows.length < 100) break;
  }
  if (release) p.owned(release);
  else {
    await p.current();
    release = p.owned(
      await p.call("/releases", "POST", {
        tag_name: p.tag,
        target_commitish: input.sha,
        name: p.tag,
        draft: true,
        prerelease: false,
        body: p.body,
      }),
    );
    if (!release.draft) throw new Error("Production staging must stay private");
  }
  const assets = await p.call(`/releases/${release.id}/assets?per_page=100`);
  let asset = assets.find((row) => row.name === apk.name);
  if (!release.draft) {
    if (!matches(asset, apk) || !sameNotes(release, p.body))
      throw new Error("Published Production release differs from this verified artifact");
    return { release_id: release.id, release_url: p.url(release), already_published: true };
  }
  if (asset && !matches(asset, apk)) {
    if (!Number.isSafeInteger(asset.id) || asset.id < 1) throw new Error("Invalid owned draft APK");
    await p.current();
    await p.call(`/releases/assets/${asset.id}`, "DELETE");
    asset = undefined;
  }
  if (!asset) {
    await p.current();
    asset = await p.call(
      `https://uploads.github.com/repos/${input.repository}/releases/${release.id}/assets?name=${encodeURIComponent(apk.name)}`,
      "POST",
      await openAsBlob(apk.path),
      true,
    );
  }
  if (!matches(asset, apk)) throw new Error("Uploaded Production APK receipt mismatch");
  if (release.body !== p.body) {
    await p.current();
    release = p.owned(await p.call(`/releases/${release.id}`, "PATCH", { body: p.body }));
    if (!release.draft || release.body !== p.body)
      throw new Error("Production staging changed unexpectedly");
  }
  return { release_id: release.id, release_url: p.url(release), already_published: false };
}

/** Publish only the same fully staged release after the verified Production OTA succeeds. */
export async function publishProductionRelease(input, staged, request = fetch) {
  const p = publication(input, request),
    apk = await artifact(input);
  if (!Number.isSafeInteger(staged?.release_id) || staged.release_id < 1)
    throw new Error("Verified private release required");
  await p.current();
  let release = p.owned(await p.call(`/releases/${staged.release_id}`));
  const assets = await p.call(`/releases/${release.id}/assets?per_page=100`);
  if (
    !matches(
      assets.find((row) => row.name === apk.name),
      apk,
    ) ||
    !sameNotes(release, p.body)
  )
    throw new Error("Production staging is incomplete");
  if (release.draft) {
    await p.current();
    release = p.owned(
      await p.call(`/releases/${release.id}`, "PATCH", { draft: false, make_latest: "true" }),
    );
    if (release.draft) throw new Error("Production release did not become public");
  }
  return { release_url: p.url(release) };
}

export async function runProductionRelease(
  action,
  env = process.env,
  { request = fetch, execute = execFileSync } = {},
) {
  if (!["stage", "publish"].includes(action)) throw new Error("Expected stage or publish");
  if (execute("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== env.RELEASE_SHA)
    throw new Error("Pinned Production checkout required");
  const input = {
    repository: env.GITHUB_REPOSITORY,
    token: env.GH_TOKEN,
    sha: env.RELEASE_SHA,
    version: env.VERSION,
    artifactDir: env.ARTIFACT_DIR ?? "apk",
    easUrl: env.EAS_BUILD_URL ?? "",
    notes: execute("git", ["log", "-1", "--format=%b"], { encoding: "utf8" }).trim(),
  };
  const file = env.RELEASE_STATE_FILE ?? "/tmp/production-release.json";
  let result;
  if (action === "stage") {
    result = await stageProductionRelease(input, request);
    writeFileSync(file, `${JSON.stringify(result)}\n`);
  } else
    result = await publishProductionRelease(input, JSON.parse(readFileSync(file, "utf8")), request);
  if (env.GITHUB_OUTPUT)
    appendFileSync(
      env.GITHUB_OUTPUT,
      Object.entries(result)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
  console.log(`Production release ${action} verified.`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runProductionRelease(process.argv[2]);
  } catch {
    console.error(
      "Production release refused: current source, private staging and APK must remain verified.",
    );
    process.exitCode = 1;
  }
}
