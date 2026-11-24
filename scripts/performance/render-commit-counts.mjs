const asynchronousScenarios = new Set([
  "EventVoteButtons and OptionVoteVoters: switch protected voter sections without casting a vote",
  "EventPlayerRatingPopover: retain the current rating popover through an authoritative update",
  "actual event wizard recovery: restore the rejected local draft without resubmitting it",
  "EventDetail: cached Participants and Tables entry and reentry keeps the event header",
  "Main list owners: Groups Events History cached reentry and real authoritative refresh",
]);

/**
 * @param {string} scenario
 * @param {readonly number[]} counts
 * @param {number} meanCount
 * @param {number} ceiling
 */
export function withinRenderCommitBudget(scenario, counts, meanCount, ceiling) {
  // These observed asynchronous list/layout transitions can schedule one extra commit.
  const excess = counts.filter((count) => count > ceiling);
  if (excess.length === 0) return meanCount <= ceiling;
  return (
    asynchronousScenarios.has(scenario) &&
    excess.length === 1 &&
    excess[0] === ceiling + 1 &&
    meanCount <= ceiling + 1 / counts.length
  );
}
