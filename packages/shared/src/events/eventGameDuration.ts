/** Scheduling convention, not BoardGameGeek metadata. Existing saved durations win. */
export const DEFAULT_GAME_DURATION_MINUTES = 120;

export function eventGameDuration(game: {
  durationMinutes?: number;
  maxPlayMinutes?: number | null;
}): number {
  const value = game.durationMinutes ?? game.maxPlayMinutes;
  return value !== undefined && value !== null && Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_GAME_DURATION_MINUTES;
}
