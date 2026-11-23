import assert from "node:assert/strict";
import test from "node:test";
import {
  changelogContent,
  isDevelopmentReleaseName,
  releaseBody,
  releaseTitle,
  releaseUrl,
} from "../../../scripts/release/release-format.mjs";
import { telegramMessage } from "../../../scripts/release/telegram-format.mjs";

const repository = "BGOrganizer/board-game-organizer";
const github = `https://github.com/${repository}`;
const sha = "a".repeat(40);
const notes = `### ✨ Features\n\n- **events:** show roles ([aaaaaaa](${github}/commit/${sha}))\n\n### 🐛 Bug Fixes\n\n- preserve seats ([bbbbbbb](${github}/commit/${"b".repeat(40)}))`;
const input = {
  repository,
  sha,
  number: 24,
  version: "1.4.0",
  environment: "development",
  title: "fix(events): show roles",
  runId: "123",
  checksum: "f".repeat(64),
  releaseUrl: `${github}/releases/tag/development-pr-24`,
  apkUrl: `${github}/releases/download/development-pr-24/app.apk`,
  webUrl: "https://web-dev.vercel.app/",
  apiUrl: "https://api-dev.vercel.app/",
  notes,
};

test("both release environments share English metadata, downloads and linked changes", () => {
  for (const environment of ["development", "production"]) {
    const body = releaseBody({
      ...input,
      environment,
      notes: `## [1.4.0](${github}/compare/v1.3.2...v1.4.0)\n\n${notes}`,
    });
    for (const label of [
      "**Version:**",
      "**Environment:**",
      "**Pull request:**",
      "**Source commit:**",
      "**CI:**",
      "## Downloads",
      "**APK:**",
      "**Web:**",
      "**API:**",
      "**SHA-256:**",
      "## Changelog",
    ])
      assert(body.includes(label), label);
    assert(body.includes(`[aaaaaaa](${github}/commit/${sha})`));
    assert(body.includes(`${github}/pull/24`));
    assert(body.indexOf("## Downloads") < body.indexOf("## Changelog"));
    assert.equal(body.includes("Internal/E2E"), environment === "development");
    assert.doesNotMatch(body, /disponibile|allegato|Nuove funzionalità/);
  }
  const optional = releaseBody({
    ...input,
    environment: "production",
    number: undefined,
    runId: undefined,
    easUrl: "https://expo.dev/builds/example",
    notes: "",
  });
  assert.match(optional, /EAS.*Build details/);
  assert.match(optional, /No changes detected/);
  assert.doesNotMatch(optional, /Pull request|\*\*CI:/);
  assert(!releaseBody({ ...input, title: undefined }).includes("fix(events): show roles"));
  assert(!releaseTitle({ ...input, environment: "production", number: "" }).includes("PR #"));
});

test("titles and version stripping preserve categories, empty notes and escaped user input", () => {
  assert.equal(releaseTitle(input), "Board Game Organizer v1.4.0 — Development · PR #24");
  assert.equal(
    releaseTitle({ ...input, environment: "production", number: undefined }),
    "Board Game Organizer v1.4.0 — Production",
  );
  assert.equal(changelogContent(notes), notes);
  assert.equal(changelogContent("## version\n\n"), "_No changes detected._");
  const hostile = releaseBody({
    ...input,
    title: "fix: [fake](https://example.test)\n<script>alert(1)</script>",
  });
  assert(hostile.includes("\\[fake\\]"));
  assert(!hostile.includes("<script>"));
  assert(isDevelopmentReleaseName("board-game-organizer-development-pr.24", 24));
  assert(isDevelopmentReleaseName("Board Game Organizer v1.5.0 — Development · PR #24", 24));
  assert(!isDevelopmentReleaseName("Board Game Organizer v1.5.0 — Development · PR #25", 24));
  assert(!isDevelopmentReleaseName("unrelated", "invalid"));
  assert(!isDevelopmentReleaseName(undefined, 24));
});

test("APK source metadata distinguishes reused Development binaries and keeps Production exact", () => {
  const apkSourceSha = "b".repeat(40);
  const body = releaseBody({ ...input, apkSourceSha });
  assert(body.includes(`**Source commit:** [aaaaaaa](${github}/commit/${sha})`));
  assert(
    body.includes(
      `**APK source commit:** [bbbbbbb](${github}/commit/${apkSourceSha}) (reused APK)`,
    ),
  );
  assert(!releaseBody({ ...input, apkSourceSha: sha }).includes("APK source commit"));
  assert.throws(
    () => releaseBody({ ...input, apkSourceSha: "invalid" }),
    /Verified release metadata/,
  );
  assert.throws(
    () => releaseBody({ ...input, environment: "production", apkSourceSha }),
    /Verified release metadata/,
  );
});

test("invalid identities and credential-bearing or insecure URLs are refused", () => {
  for (const extra of [
    { environment: "staging" },
    { version: "bad" },
    { number: 0 },
    { number: undefined },
    { number: "24\ninjected" },
  ])
    assert.throws(() => releaseTitle({ ...input, ...extra }));
  for (const extra of [
    { repository: "owner/repo/other" },
    { repository: undefined },
    { sha: "bad" },
    { sha: undefined },
    { checksum: "bad" },
    { checksum: undefined },
    { runId: 0 },
  ])
    assert.throws(() => releaseBody({ ...input, ...extra }));
  for (const url of [
    "http://github.com/a",
    "https://user:secret@github.com/a",
    "https://:secret@github.com/a",
    "https://example.test/a",
  ])
    assert.throws(() => releaseUrl(url, "github.com"));
  assert.equal(releaseUrl("https://example.test"), "https://example.test/");
});

test("Telegram sends the same English groups and commit links with direct PR/APK/Web/Release links", () => {
  for (const environment of ["development", "production"]) {
    const text = telegramMessage({
      ...input,
      environment,
      notes: `## version\n\n${notes}`,
    });
    assert(text.includes(`${github}/pull/24`));
    assert(text.includes(`href="${input.apkUrl}"`));
    assert(text.includes(`href="${input.releaseUrl}"`));
    assert(text.includes("✨ Features") && text.includes("🐛 Bug Fixes"));
    assert(text.includes(`<a href="${github}/commit/${sha}">aaaaaaa</a>`));
    assert.doesNotMatch(text, /api-dev|API endpoint|EAS|version<\/b>/);
  }
  const direct = telegramMessage({
    ...input,
    environment: "production",
    number: undefined,
  });
  assert.doesNotMatch(direct, /\/pull\/|PR #/);
  assert.match(telegramMessage({ ...input, notes: "" }), /<i>No changes detected\.<\/i>/);
});

test("Telegram escapes HTML and entities, preserves Unicode, code and hyperlinks", () => {
  const text = telegramMessage({
    ...input,
    webUrl: "https://web-dev.vercel.app/?a=1&b=2",
    notes: `### Changes\n\n- **roles:** <script> & "quoted" café \`code\` ([aaaaaaa](${github}/commit/${sha}))\n<!-- hidden marker -->`,
  });
  assert(text.includes("&lt;script&gt; &amp; &quot;quoted&quot; café <code>code</code>"));
  assert(text.includes("?a=1&amp;b=2"));
  assert(!text.includes("hidden marker"));
  assert.equal((text.match(/<a /g) ?? []).length, (text.match(/<\/a>/g) ?? []).length);
  const literal = telegramMessage({
    ...input,
    notes: "- preserve `**literal**` and `[label](https://example.test)`",
  });
  assert(literal.includes("<code>**literal**</code>"));
  assert(literal.includes("<code>[label](https://example.test)</code>"));
  assert.doesNotMatch(literal, /<code>.*<(?:a|b)[ >]/);
});

test("a long Telegram changelog shares one bounded excerpt across groups without cutting commit links", () => {
  const groups = ["✨ Features", "🐛 Bug Fixes", "⚡ Performance"];
  const long = groups
    .map(
      (heading) =>
        `### ${heading}\n\n${Array.from({ length: 50 }, (_, i) => `- ${heading} change ${i}: <details> & "quoted" ([aaaaaaa](${github}/commit/${sha}))`).join("\n")}`,
    )
    .join("\n\n");
  const text = telegramMessage({ ...input, notes: long }, 1800);
  assert(text.length <= 1800);
  for (const heading of groups) assert(text.includes(`${heading} change 0`), heading);
  assert(!text.includes("change 49"));
  assert.match(text, /Read the full changelog/);
  assert.equal((text.match(/<a /g) ?? []).length, (text.match(/<\/a>/g) ?? []).length);
  assert.equal((text.match(/<i>/g) ?? []).length, (text.match(/<\/i>/g) ?? []).length);
  assert.throws(() => telegramMessage(input, 10), /links exceed/);
  for (const limit of [0, 4097, 500.5, Number.NaN])
    assert.throws(() => telegramMessage(input, limit));
  const headings = `${"### Extra category\n".repeat(1000)}`;
  const headersOnly = telegramMessage({ ...input, notes: headings }, 1000);
  assert(headersOnly.length <= 1000);
  assert.match(headersOnly, /Read the full changelog/);
  const mixed = telegramMessage(
    {
      ...input,
      notes: `### Short category\n\n- One change ([aaaaaaa](${github}/commit/${sha}))\n\n${long}`,
    },
    1800,
  );
  assert(mixed.includes("One change"));
  assert(mixed.length <= 1800);
});

test("Telegram rejects wrong repositories, release-page APK links and invalid targets", () => {
  for (const extra of [
    { repository: "bad" },
    { repository: undefined },
    { apkUrl: input.releaseUrl },
    { apkUrl: `${github}/releases/download/v1.4.0/archive.zip` },
    { releaseUrl: `${github}/issues/1` },
    { apkUrl: "https://example.test/app.apk" },
    { releaseUrl: "https://github.com/other/repo/releases/tag/v1" },
    { webUrl: "javascript:alert(1)" },
  ])
    assert.throws(() => telegramMessage({ ...input, ...extra }));
});
