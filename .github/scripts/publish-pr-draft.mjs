import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, openAsBlob, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireCurrentPr } from "./ci-current-pr.mjs";

function https(value, host) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (host && url.hostname !== host))
    throw new Error("Invalid publication URL");
  return url.href;
}

/** Upload a revision-named APK before replacing links or removing known old APK assets. */
export async function publishDevelopmentDraft(input, request = fetch) {
  if (
    !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(input.version) ||
    !/^[\w.-]+\.apk$/.test(input.apkName) ||
    input.apkName.length > 180 ||
    !/^[1-9][0-9]*$/.test(String(input.runId)) ||
    !/^[1-9][0-9]*$/.test(String(input.attempt)) ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 256
  )
    throw new Error("Invalid Development release identity");
  const web = https(input.webUrl),
    apiUrl = https(input.apiUrl);
  if (![web, apiUrl].every((url) => new URL(url).hostname.endsWith(".vercel.app")))
    throw new Error("Immutable Development Preview URLs required");
  const eas = input.easUrl ? https(input.easUrl) : "";
  const size = statSync(input.apkPath).size;
  if (!size) throw new Error("Verified Development APK required");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(input.apkPath)) hash.update(chunk);
  const digest = hash.digest("hex");
  const current = () => requireCurrentPr(input, request);
  await current();
  const api = `https://api.github.com/repos/${input.repository}`;
  async function call(url, method = "GET", body, upload = false) {
    const response = await request(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(upload ? 600_000 : 30_000),
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/vnd.github+json",
        ...(body
          ? {
              "Content-Type": upload
                ? "application/vnd.android.package-archive"
                : "application/json",
            }
          : {}),
      },
      ...(body ? { body: upload ? body : JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Development release request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  }
  const tag = `v${input.version}-pr.${input.number}`,
    name = `board-game-organizer-${tag}`;
  let release;
  for (let page = 1; !release; page++) {
    const rows = await call(`${api}/releases?per_page=100&page=${page}`);
    release = rows.find((row) => row.name === name || row.tag_name === tag);
    if (release || rows.length < 100) break;
  }
  if (release && !release.draft) throw new Error("Refusing to replace a published release");
  await current();
  if (!release)
    release = await call(`${api}/releases`, "POST", {
      tag_name: tag,
      target_commitish: input.headSha,
      name,
      draft: true,
      prerelease: true,
    });
  if (!Number.isSafeInteger(release.id) || release.id < 1)
    throw new Error("Invalid draft release receipt");
  const oldAssets = await call(`${api}/releases/${release.id}/assets?per_page=100`);
  const assetName = `${input.apkName.slice(0, -4)}-${input.headSha.slice(0, 12)}-${input.runId}-${input.attempt}.apk`;
  let asset = oldAssets.find((item) => item.name === assetName);
  if (!asset)
    asset = await call(
      `https://uploads.github.com/repos/${input.repository}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
      "POST",
      await openAsBlob(input.apkPath),
      true,
    );
  if (!Number.isSafeInteger(asset.id) || asset.size !== size || asset.digest !== `sha256:${digest}`)
    throw new Error("Uploaded APK checksum/size receipt mismatch");
  const apkUrl = https(asset.browser_download_url, "github.com");
  await current();
  const body = [
    "## Development preview disponibile",
    "",
    `**PR:** #${input.number} — ${input.title}`,
    `**Commit:** ${input.headSha}`,
    "",
    "Questa pubblicazione non certifica il superamento del flusso Internal/E2E.",
    `[Stato verifiche Internal e merge](https://github.com/${input.repository}/actions/runs/${input.runId})`,
    "",
    "### Development",
    `- **APK:** [${assetName}](${apkUrl})`,
    `- **SHA256:** ${digest}`,
    `- **Web:** ${web}`,
    `- **API:** ${apiUrl}`,
    ...(eas ? [`- **EAS:** ${eas}`] : []),
    "",
    "### Changelog",
    "",
    input.changelog,
  ].join("\n");
  await call(`${api}/releases/${release.id}`, "PATCH", { draft: true, prerelease: true, body });
  // Native APK names include a build timestamp; retain ownership across successive builds.
  const ownedStem = input.apkName.replace(/-\d{14}(?=-development[.-])/, "").slice(0, -4);
  // Delete only captured prior Development APKs, never concurrent/new or unrelated assets.
  for (const old of oldAssets) {
    const previousName = old.name.replace(/-\d{14}(?=-development[.-])/, "");
    if (
      old.id !== asset.id &&
      previousName.endsWith(".apk") &&
      previousName.startsWith(ownedStem)
    ) {
      await current();
      await call(`${api}/releases/assets/${old.id}`, "DELETE");
    }
  }
  return {
    release_url: https(release.html_url, "github.com"),
    release_id: release.id,
    apk_url: apkUrl,
  };
}

async function main() {
  const e = process.env;
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(e.PR_BASE_SHA))
    throw new Error("Verified changelog base required");
  const identity = {
    repository: e.GITHUB_REPOSITORY,
    number: e.PR_NUMBER,
    headSha: e.PR_HEAD_SHA,
    token: e.GH_TOKEN,
    runId: e.GITHUB_RUN_ID,
    attempt: e.GITHUB_RUN_ATTEMPT,
  };
  await requireCurrentPr(identity);
  const changelog = execFileSync(
    process.execPath,
    ["scripts/release/pr-changelog.mjs", e.PR_BASE_SHA, e.PR_HEAD_SHA],
    { encoding: "utf8" },
  );
  writeFileSync("/tmp/pr-changelog.md", changelog);
  const result = await publishDevelopmentDraft({
    ...identity,
    title: e.PR_TITLE,
    version: e.APP_VERSION,
    apkName: e.APK_NAME,
    apkPath: e.APK_PATH,
    webUrl: e.DEVELOPMENT_WEB_URL,
    apiUrl: e.DEVELOPMENT_API_URL,
    easUrl: e.EAS_BUILD_URL,
    changelog,
  });
  for (const [key, value] of Object.entries(result))
    appendFileSync(e.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log("Verified Development draft published; Internal status remains independent.");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
