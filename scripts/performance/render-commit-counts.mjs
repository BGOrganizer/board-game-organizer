/**
 * @param {readonly number[]} counts
 * @param {number} meanCount
 * @param {number} ceiling
 */
export function withinRenderCommitBudget(counts, meanCount, ceiling) {
  const excess = counts.filter((count) => count > ceiling);
  if (excess.length === 0) return meanCount <= ceiling;

  // Hosted interaction journeys can schedule one extra commit in up to two of ten samples.
  // Single-commit components, recurring excesses, and larger deviations stay strict.
  return (
    ceiling > 1 &&
    excess.length <= 2 &&
    excess.every((count) => count === ceiling + 1) &&
    meanCount <= ceiling + 2 / counts.length
  );
}
