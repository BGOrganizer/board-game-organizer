/**
 * @param {readonly number[]} counts
 * @param {number} meanCount
 * @param {number} ceiling
 */
export function withinRenderCommitBudget(counts, meanCount, ceiling) {
  const excess = counts.reduce((total, count) => total + Math.max(0, count - ceiling), 0);
  if (excess === 0) return meanCount <= ceiling;

  // Hosted interaction journeys can split up to two commits across the ten samples.
  // Single-commit components and recurring excesses keep their strict limits.
  return ceiling > 1 && excess <= 2 && meanCount <= ceiling + 2 / counts.length;
}
