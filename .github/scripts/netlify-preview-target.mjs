const previewUrl =
  /^https:\/\/(ci-pr|pr)-([1-9]\d*)-([1-9]\d*)-([1-9]\d*)--bgo-(api|web)-development\.netlify\.app\/?$/;

/** A partial rerun may reuse an already verified deploy from this run. */
export function netlifyPreviewAttempt(url, { lane, app, number, runId, attempt }) {
  const match = previewUrl.exec(url ?? "");
  if (!match || match[0] !== url || !/^[1-9]\d*$/.test(String(attempt))) return;
  const [, deploymentLane, pr, run, deployAttempt, deploymentApp] = match;
  if (
    deploymentLane === lane &&
    deploymentApp === app &&
    pr === String(number) &&
    run === String(runId) &&
    BigInt(deployAttempt) <= BigInt(attempt)
  )
    return deployAttempt;
}

export function netlifyMobileApiAttempt(env) {
  const number = env.PR_NUMBER;
  const channel = env.EXPO_UPDATE_CHANNEL;
  if (
    env.APP_VARIANT !== "development" ||
    env.EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS ||
    (channel !== "development" && channel !== `ci-pr-${number}`)
  )
    return;
  return netlifyPreviewAttempt(env.EXPO_PUBLIC_API_URL, {
    lane: channel === "development" ? "pr" : "ci-pr",
    app: "api",
    number,
    runId: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
  });
}
