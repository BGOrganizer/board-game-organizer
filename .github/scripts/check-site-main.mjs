import { execFileSync } from "node:child_process";
import { inspectMainRelease } from "./main-release-preparation.mjs";

try {
  const [, , ref, sourceSha] = process.argv;
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (ref !== "refs/heads/main" || head !== sourceSha) {
    throw new Error("Expected the validated main checkout");
  }
  // A release-only child leaves Site's source intact, even before the release tag exists.
  if (inspectMainRelease({ sourceSha, requireTag: false }).mode === "superseded") {
    console.log("Site deployment skipped because a newer main commit is available.");
    process.exitCode = 3;
  }
} catch (error) {
  console.error(`Cannot verify Site production source: ${error.message}`);
  process.exitCode = 1;
}
