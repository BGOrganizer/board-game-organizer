/** Envelope of verified BGG pairs. Missing, partial or invalid game data imposes no limit. */
export function gamePlayerBounds(
  games: readonly { minPlayers?: number | null; maxPlayers?: number | null }[],
): { minPlayers: number; maxPlayers: number } | null {
  let minimum = Infinity;
  let maximum = 0;
  for (const { minPlayers, maxPlayers } of games) {
    if (
      typeof minPlayers !== "number" ||
      typeof maxPlayers !== "number" ||
      !Number.isSafeInteger(minPlayers) ||
      !Number.isSafeInteger(maxPlayers) ||
      minPlayers <= 0 ||
      maxPlayers < minPlayers
    )
      continue;
    minimum = Math.min(minimum, minPlayers);
    maximum = Math.max(maximum, maxPlayers);
  }
  return maximum ? { minPlayers: minimum, maxPlayers: maximum } : null;
}
