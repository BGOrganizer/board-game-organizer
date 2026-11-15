import { classifyPlayerCount, type PlayerPoll } from "@board-game-organizer/schemas";

/** At most two ascending BGG Best counts; tied and unsampled votes remain unknown. */
export function gameBestPlayers(poll: PlayerPoll | null | undefined): string | null {
  if (!poll) return null;
  const counts = poll.rows
    .filter((row) => classifyPlayerCount(poll, row.players) === "BEST")
    .sort((a, b) => a.players - b.players)
    .map((row) => `${row.players}${row.orMore ? "+" : ""}`);
  return [...new Set(counts)].slice(0, 2).join("-") || null;
}
