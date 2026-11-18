// Start at a real failed next-page footer, after restoring connectivity. No
// mocked rows, provider mutation, or silently optional error precondition.
if (
  typeof GROUP_RANKING_RETRY_ACK === "undefined" ||
  GROUP_RANKING_RETRY_ACK !== "owned-preview-next-page-failure"
)
  throw new Error("A verified owned Preview ranking with a real failed next page is required");
var retryFixture = JSON.parse(String(GROUP_RANKING_INPUT));
var priorUser = retryFixture.previousPageUserId;
if (
  typeof priorUser !== "string" ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(priorUser) ||
  priorUser === retryFixture.userId
)
  throw new Error("previousPageUserId must identify a distinct visible player on the loaded page");
output.groupRankingRetry = {
  previousRow: `group-ranking-player-${priorUser}`,
  retry:
    GROUP_RANKING_LOCALE === "it"
      ? "^Impossibile caricare le classifiche\\. Riprova$"
      : "^Could not load leaderboards\\. Retry$",
};
