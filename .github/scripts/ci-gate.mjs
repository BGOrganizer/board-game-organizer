import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const qualityJobs = ["commitlint", "lint", "typecheck", "unit-tests", "integration-tests"];
export const internalJobs = [
  "build-api",
  "build-web",
  "deploy-preview-api",
  "deploy-preview-web",
  "build-mobile-internal",
  "provision",
  "sync-e2e-users",
  "cleanup-e2e-user",
  "cleanup-e2e-db",
];

/** Development publication is deliberately not a prerequisite of the merge gate. */
export function verifyCiGate(mode, results, e2eEnabled) {
  if (!["branch", "pr"].includes(mode)) throw new Error("Missing eligible CI context");
  if (mode === "pr" && !["true", "false"].includes(e2eEnabled))
    throw new Error("Explicit PR E2E policy required");
  const required = ["context", ...qualityJobs, ...(mode === "pr" ? internalJobs : [])];
  for (const name of required)
    if (results[name] !== "success") throw new Error(`Required CI gate did not succeed: ${name}`);
  if (mode === "pr") {
    for (const name of ["e2e-maestro", "e2e-playwright"])
      if (results[name] !== (e2eEnabled === "true" ? "success" : "skipped"))
        throw new Error(`Unexpected E2E result: ${name}`);
  }
  return mode === "pr" && e2eEnabled === "false"
    ? "Quality/Internal passed; PR E2E intentionally disabled, not acceptance evidence."
    : "Required CI gates passed.";
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    console.log(
      verifyCiGate(
        process.env.CI_MODE,
        JSON.parse(process.env.CI_RESULTS),
        process.env.PR_E2E_ENABLED,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
