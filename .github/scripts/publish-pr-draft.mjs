import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, openAsBlob, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { mcpReleaseAsset } from "../../scripts/release/mcp-release-asset.mjs";
import {
  isDevelopmentReleaseName,
  releaseBody,
  releaseTitle,
} from "../../scripts/release/release-format.mjs";
import { requireCurrentPr } from "./ci-current-pr.mjs";

function https(value, host) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (host && url.hostname !== host))
    throw new Error("Invalid publication URL");
  return url.href;
}

/** Move only a managed preview tag, with a lease so a concurrent publication wins safely. */
export async function promotePreviewTag(
  tag,
  headSha,
  guard,
  allowExisting,
  execute = execFileSync,
) {
  if (
    !/^(?:development-pr-[1-9]\d*|untagged-[a-f0-9]+|v\d+\.\d+\.\d+(?:[-+][\w.-]+)?-pr\.[1-9]\d*)$/.test(
      tag,
    ) ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(headSha)
  )
    throw new Error("Invalid Development tag identity");
  const ref = `refs/tags/${tag}`;
  let existing;
  try {
    existing = execute("git", ["ls-remote", "--tags", "origin", ref], {
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error("Cannot inspect the Development tag");
  }
  const expected = existing ? existing.split(/\s+/)[0] : "";
  if (
    existing &&
    (!allowExisting ||
      !/^[a-f0-9]{40}(?:[a-f0-9]{24})?\s/.test(existing) ||
      existing.split(/\s+/)[1] !== ref)
  )
    throw new Error("Refusing to replace an unmanaged Development tag");
  await guard();
  if (expected !== headSha) {
    try {
      execute(
        "git",
        ["push", `--force-with-lease=${ref}:${expected}`, "origin", `${headSha}:${ref}`],
        { encoding: "utf8", stdio: "pipe" },
      );
    } catch {
      throw new Error("Development tag changed or could not be promoted; refusing publication");
    }
  }
}

/** One public preview per PR; upload and verify before replacing the current APK. */
export async function publishDevelopmentDraft(
  input,
  request = fetch,
  publishTag = promotePreviewTag,
) {
  const apkSourceSha = input.apkSourceSha ?? input.sourceSha;
  if (
    !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(input.version) ||
    !/^[\w.-]+\.apk$/.test(input.apkName) ||
    input.apkName.length > 180 ||
    !/^[1-9][0-9]*$/.test(String(input.runId)) ||
    !/^[1-9][0-9]*$/.test(String(input.attempt)) ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 256 ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(input.sourceSha ?? "") ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(apkSourceSha ?? "")
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
  const mcp = input.packageMcp
    ? mcpReleaseAsset(
        "development",
        `${input.version}-dev.pr.${input.number}.sha-${input.sourceSha.slice(0, 12)}`,
      )
    : null;
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
                ? body.type || "application/vnd.android.package-archive"
                : "application/json",
            }
          : {}),
      },
      ...(body ? { body: upload ? body : JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`Development release request failed (${response.status})`);
    return response.status === 204 ? null : response.json();
  }
  const canonicalTag = `development-pr-${input.number}`,
    name = releaseTitle({ ...input, environment: "development" }),
    owner = `<!-- bgo:development-pr=${input.number} -->`,
    legacyName = new RegExp(`^board-game-organizer-v[\\w.+-]+-pr\\.${input.number}$`);
  let release;
  for (let page = 1; !release; page++) {
    const rows = await call(`${api}/releases?per_page=100&page=${page}`);
    release = rows.find(
      (row) =>
        isDevelopmentReleaseName(row.name, input.number) ||
        row.tag_name === canonicalTag ||
        legacyName.test(row.name),
    );
    if (release || rows.length < 100) break;
  }
  const managed =
    isDevelopmentReleaseName(release?.name, input.number) && release?.body?.includes(owner);
  if (release && (!release.prerelease || (!release.draft && !managed)))
    throw new Error("Refusing to replace an unrelated or stable release");
  const tag = release?.tag_name || canonicalTag;
  if (
    tag !== canonicalTag &&
    !/^untagged-[a-f0-9]+$/.test(tag) &&
    !new RegExp(`^v[\\w.+-]+-pr\\.${input.number}$`).test(tag)
  )
    throw new Error("Development release tag belongs to a different channel");
  await current();
  if (!release)
    release = await call(`${api}/releases`, "POST", {
      tag_name: tag,
      target_commitish: input.headSha,
      name,
      draft: true,
      prerelease: true,
      body: owner,
    });
  if (!Number.isSafeInteger(release.id) || release.id < 1)
    throw new Error("Invalid draft release receipt");
  const oldAssets = await call(`${api}/releases/${release.id}/assets?per_page=100`);
  const apkRevision = apkSourceSha === input.sourceSha ? input.headSha : apkSourceSha;
  const assetName = `${input.apkName.slice(0, -4)}-${apkRevision.slice(0, 12)}-${input.runId}-${input.attempt}.apk`;
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
  https(asset.browser_download_url, "github.com");
  // Draft upload receipts can retain an untagged URL after the release becomes public.
  const apkUrl = `https://github.com/${input.repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
  let mcpUrl;
  if (mcp) {
    let uploaded = oldAssets.find((item) => item.name === mcp.name);
    if (!uploaded) {
      await current();
      uploaded = await call(
        `https://uploads.github.com/repos/${input.repository}/releases/${release.id}/assets?name=${encodeURIComponent(mcp.name)}`,
        "POST",
        mcp.body,
        true,
      );
    }
    if (
      !Number.isSafeInteger(uploaded.id) ||
      uploaded.id < 1 ||
      uploaded.state !== "uploaded" ||
      uploaded.name !== mcp.name ||
      uploaded.size !== mcp.size ||
      uploaded.digest !== mcp.digest
    )
      throw new Error("Uploaded Development MCP package checksum/size receipt mismatch");
    mcpUrl = `https://github.com/${input.repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(mcp.name)}`;
  }
  await publishTag(tag, input.headSha, current, Boolean(managed));
  await current();
  const body = releaseBody({
    ...input,
    environment: "development",
    sha: input.sourceSha,
    apkSourceSha,
    checksum: digest,
    apkUrl,
    mcpUrl,
    webUrl: web,
    apiUrl,
    easUrl: eas,
    notes: input.changelog,
  });
  const published = await call(`${api}/releases/${release.id}`, "PATCH", {
    name,
    tag_name: tag,
    target_commitish: input.headSha,
    draft: false,
    prerelease: true,
    make_latest: "false",
    body,
  });
  if (
    published.id !== release.id ||
    published.draft !== false ||
    published.prerelease !== true ||
    published.tag_name !== tag
  )
    throw new Error("Invalid public Development release receipt");
  const releaseUrl = https(published.html_url, "github.com");
  // Anonymous requests deliberately carry no GitHub token, including after redirects.
  for (const url of [releaseUrl, apkUrl, ...(mcpUrl ? [mcpUrl] : [])]) {
    for (let attempt = 0; ; attempt++) {
      const response = await request(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) break;
      if (attempt === 2)
        throw new Error(`Public Development download unavailable (${response.status})`);
      await delay(1000);
    }
  }
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
  const ownedMcp = new RegExp(
    `^board-game-organizer-mcp-\\d+\\.\\d+\\.\\d+-dev\\.pr\\.${input.number}\\.sha-[a-f0-9]{12}\\.zip$`,
  );
  for (const old of oldAssets) {
    if (old.name !== mcp?.name && ownedMcp.test(old.name)) {
      await current();
      await call(`${api}/releases/assets/${old.id}`, "DELETE");
    }
  }
  return {
    release_url: releaseUrl,
    release_id: release.id,
    apk_url: apkUrl,
  };
}

async function main() {
  const e = process.env;
  const sourceSha = e.PREVIEW_SOURCE_SHA || e.APK_SOURCE_SHA;
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
    sourceSha,
    apkSourceSha: e.APK_SOURCE_SHA || sourceSha,
    version: e.APP_VERSION,
    apkName: e.APK_NAME,
    apkPath: e.APK_PATH,
    webUrl: e.DEVELOPMENT_WEB_URL,
    apiUrl: e.DEVELOPMENT_API_URL,
    easUrl: e.EAS_BUILD_URL,
    packageMcp: e.PACKAGE_MCP === "true",
    changelog,
  });
  for (const [key, value] of Object.entries(result))
    appendFileSync(e.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(
    "Verified public Development preview published; Internal status remains independent.",
  );
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
