import { spawnSync } from "node:child_process";
import { appendFileSync, statSync } from "node:fs";

const { GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary } = process.env;
const apk = process.argv[2];
const file = statSync(apk);
if (!file.isFile() || file.size === 0)
  throw new Error("A non-empty APK is required for EAS upload");

const result = spawnSync(
  "eas",
  ["upload", "--platform", "android", "--build-path", apk, "--json"],
  {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  },
);
if (result.error) throw result.error;
if (result.status === 0) {
  const { url } = JSON.parse(result.stdout);
  if (typeof url !== "string" || new URL(url).protocol !== "https:" || /[\r\n]/.test(url)) {
    throw new Error("EAS upload returned an invalid HTTPS build URL");
  }
  appendFileSync(output, `url=${url}\nquota-exhausted=false\n`);
} else if (
  result.status === 4 &&
  `${result.stdout}${result.stderr}`.includes(
    "This account has used its local builds from the free plan this month,",
  )
) {
  console.warn(
    "::warning::EAS upload skipped: local monthly quota exhausted. GitHub APK publication continues without an EAS link.",
  );
  appendFileSync(output, "url=\nquota-exhausted=true\n");
  appendFileSync(
    summary,
    "### EAS upload skipped\nLocal monthly quota exhausted. APK build and quality gates remain mandatory; GitHub publication continues without an EAS link.\n",
  );
} else {
  process.stderr.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  process.exitCode = result.status || 1;
}
