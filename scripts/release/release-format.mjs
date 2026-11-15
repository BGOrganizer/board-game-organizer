const versionPattern = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

export function releaseTitle({ environment, version, number }) {
  if (!["development", "production"].includes(environment) || !versionPattern.test(version))
    throw new Error("Invalid release environment or version");
  if (number !== undefined && number !== "" && !/^[1-9]\d*$/.test(String(number)))
    throw new Error("Invalid release pull request");
  if (environment === "development" && !number)
    throw new Error("Development pull request required");
  return `Board Game Organizer v${version} — ${environment === "production" ? "Production" : "Development"}${number ? ` · PR #${number}` : ""}`;
}

export function releaseUrl(value, host) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (host && url.hostname !== host))
    throw new Error("Invalid release URL");
  return url.href;
}

export function changelogContent(notes) {
  return (
    notes
      .trim()
      .replace(/^## [^\n]*\n*/, "")
      .trim() || "_No changes detected._"
  );
}

function markdownText(value) {
  return String(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\`*_[\]<>]/g, "\\$&");
}

export function releaseBody(input) {
  const title = releaseTitle(input);
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(input.repository ?? "") ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(input.sha ?? "") ||
    !/^[a-f0-9]{64}$/.test(input.checksum ?? "") ||
    (input.runId !== undefined && !/^[1-9]\d*$/.test(String(input.runId)))
  )
    throw new Error("Verified release metadata required");
  const github = `https://github.com/${input.repository}`;
  const owner =
    input.environment === "production"
      ? `<!-- bgo:production=${input.sha};version=${input.version} -->`
      : `<!-- bgo:development-pr=${input.number} -->`;
  const details = [
    `**Version:** ${input.version}`,
    `**Environment:** ${input.environment === "production" ? "Production" : "Development"}`,
    ...(input.number
      ? [
          `**Pull request:** [#${input.number}](${github}/pull/${input.number})${input.title ? ` — ${markdownText(input.title)}` : ""}`,
        ]
      : []),
    `**Source commit:** [${input.sha.slice(0, 7)}](${github}/commit/${input.sha})`,
    ...(input.runId ? [`**CI:** [Verification run](${github}/actions/runs/${input.runId})`] : []),
  ].join("\n\n");
  const downloads = [
    `- **APK:** [Download APK](${releaseUrl(input.apkUrl, "github.com")})`,
    `- **Web:** [Open web app](${releaseUrl(input.webUrl)})`,
    `- **API:** [API endpoint](${releaseUrl(input.apiUrl)})`,
    ...(input.easUrl
      ? [`- **EAS:** [Build details](${releaseUrl(input.easUrl, "expo.dev")})`]
      : []),
    `- **SHA-256:** \`${input.checksum}\``,
  ].join("\n");
  return [
    owner,
    `## ${title}`,
    details,
    ...(input.environment === "development"
      ? [
          "Development publication is independent of Internal/E2E verification. Check the CI run for merge readiness.",
        ]
      : []),
    "## Downloads",
    downloads,
    "## Changelog",
    changelogContent(input.notes),
  ].join("\n\n");
}

export function isDevelopmentReleaseName(name, number) {
  if (!/^[1-9]\d*$/.test(String(number))) return false;
  return (
    name === `board-game-organizer-development-pr.${number}` ||
    new RegExp(
      `^Board Game Organizer v\\d+\\.\\d+\\.\\d+(?:[-+][\\w.-]+)? — Development · PR #${number}$`,
    ).test(name)
  );
}
