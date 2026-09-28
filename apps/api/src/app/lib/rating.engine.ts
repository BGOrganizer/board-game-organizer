import type { MatchResults, RatingState } from "@board-game-organizer/schemas";
import { ordinal, rate, rating } from "openskill";

/** One team per player. Final positions form a single multiplayer outcome, not sequential duels. */
export const NEW_RATING: RatingState = { mu: 25, sigma: 25 / 3, gamesPlayed: 0 };
export const RATING_ALGORITHM = "openskill-v1" as const;

export function initialGroupRating(global?: RatingState): RatingState {
  if (!global) return { ...NEW_RATING };
  return {
    mu: global.mu,
    sigma: Math.min(NEW_RATING.sigma, Math.max((NEW_RATING.sigma * 200) / 350, global.sigma * 1.5)),
    gamesPlayed: 0,
  };
}

export function conservativeScore(state: Pick<RatingState, "mu" | "sigma">): number {
  return ordinal(state); // Default OpenSkill score: mu - 3 * sigma.
}

export function calculateMatchRatings(
  entries: MatchResults["entries"],
  before: Map<string, RatingState>,
): Array<{
  userId: string;
  rank: number;
  didNotFinish: boolean;
  before: RatingState;
  after: RatingState;
}> {
  const active = entries.filter((entry) => entry.score !== null);
  if (active.length < 2) return []; // No comparative result; no gamesPlayed increment, including ND.
  if (active.some((entry) => entry.rank === null))
    throw new Error("Scored players must have a rank");
  const lastRank = Math.max(...active.map((entry) => entry.rank as number)) + 1;
  const sorted = [...entries].sort((a, b) => a.userId.localeCompare(b.userId));
  const ranks = sorted.map((entry) => entry.rank ?? lastRank);
  const initial = sorted.map((entry) => before.get(entry.userId) ?? NEW_RATING);
  const updated = rate(
    initial.map((state) => [rating(state)]),
    { rank: ranks },
  );
  return sorted.map((entry, index) => ({
    userId: entry.userId,
    rank: ranks[index],
    didNotFinish: entry.score === null,
    before: { ...initial[index] },
    after: { ...updated[index][0], gamesPlayed: initial[index].gamesPlayed + 1 },
  }));
}
