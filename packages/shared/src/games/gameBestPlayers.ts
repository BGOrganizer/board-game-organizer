import type { PlayerPoll } from "@board-game-organizer/schemas";

/** At most two ascending BGG Best counts; tied and unsampled votes remain unknown. */
export function gameBestPlayersWithPercentage(poll: PlayerPoll | null | undefined) {
  if (!poll?.totalVotes) return [];
  const rows = poll.rows
    .filter(
      (row) => row.sampleCount > 0 && row.best > row.recommended && row.best > row.notRecommended,
    )
    .sort((a, b) => a.players - b.players || Number(a.orMore) - Number(b.orMore));
  const best = new Map<string, number>();
  for (const row of rows) {
    const count = `${row.players}${row.orMore ? "+" : ""}`;
    if (!best.has(count)) best.set(count, row.best / row.sampleCount);
    if (best.size === 2) break;
  }
  return Array.from(best, ([count, fraction]) => ({ count, fraction }));
}

export function gameBestPlayers(poll: PlayerPoll | null | undefined): string | null {
  return (
    gameBestPlayersWithPercentage(poll)
      .map(({ count }) => count)
      .join("-") || null
  );
}
