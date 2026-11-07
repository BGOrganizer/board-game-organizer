import type { MatchResults, RatingState } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  calculateMatchRatings,
  conservativeScore,
  displayRating,
  initialGroupRating,
  isProvisional,
  NEW_RATING,
} from "@/app/lib/ratings/rating.engine";

const entry = (userId: string, rank: number | null, score: string | null) => ({
  userId,
  rank,
  score,
});
const ratings = (entries: MatchResults["entries"], prior: Record<string, RatingState> = {}) =>
  calculateMatchRatings(entries, new Map(Object.entries(prior)));

describe("OpenSkill per physical match", () => {
  it("uses native defaults and conservative score", () => {
    expect(NEW_RATING).toEqual({ mu: 25, sigma: 25 / 3, gamesPlayed: 0 });
    expect(conservativeScore(NEW_RATING)).toBeCloseTo(0, 10);
    expect(displayRating(NEW_RATING)).toBeCloseTo(500, 10);
    expect(displayRating({ mu: -500, sigma: NEW_RATING.sigma })).toBeLessThan(0);
    expect(isProvisional(NEW_RATING)).toBe(true);
    expect(isProvisional({ gamesPlayed: 4 })).toBe(true);
    expect(isProvisional({ gamesPlayed: 5 })).toBe(false);
    const [winner, loser] = ratings([entry("a", 1, "5"), entry("b", 2, "2")]);
    expect(conservativeScore(loser.after)).toBeLessThan(0);
    expect(displayRating(loser.after)).toBeCloseTo(498.1669, 4);
    expect(displayRating(loser.after) - displayRating(loser.before)).toBeCloseTo(
      conservativeScore(loser.after) - conservativeScore(loser.before),
    );
    expect(winner.after.mu).toBeGreaterThan(25);
    expect(loser.after.mu).toBeLessThan(25);
    expect(winner.after.sigma).toBeLessThan(NEW_RATING.sigma);
    expect(winner.after.gamesPlayed).toBe(1);
  });

  it("rejects scored players without final positions", () => {
    expect(() => ratings([entry("a", null, "5"), entry("b", 1, "2")])).toThrow(
      "Scored players must have a rank",
    );
  });

  it("matches the published OpenSkill four-player example", () => {
    const result = ratings([
      entry("a", 4, "1"),
      entry("b", 1, "4"),
      entry("c", 3, "2"),
      entry("d", 2, "3"),
    ]);
    expect(result.map((row) => row.after.mu)).toEqual([
      expect.closeTo(20.9624, 3),
      expect.closeTo(27.7953, 3),
      expect.closeTo(24.6894, 3),
      expect.closeTo(26.5529, 3),
    ]);
    expect(result.map((row) => row.after.sigma)).toEqual([
      expect.closeTo(8.0841, 3),
      expect.closeTo(8.2636, 3),
      expect.closeTo(8.0841, 3),
      expect.closeTo(8.1796, 3),
    ]);
  });

  it("evaluates multiplayer order and shared ties together, independent of input order", () => {
    const rows = [
      entry("b", 1, "3"),
      entry("a", 1, "3"),
      entry("c", 3, "1"),
      entry("d", null, null),
      entry("e", null, null),
    ];
    const sorted = ratings(rows);
    const reversed = ratings([...rows].reverse());
    expect(sorted).toEqual(reversed);
    expect(sorted.find((row) => row.userId === "a")?.after.mu).toBeCloseTo(
      sorted.find((row) => row.userId === "b")?.after.mu ?? 0,
    );
    expect(sorted.find((row) => row.userId === "c")?.after.mu).toBeGreaterThan(
      sorted.find((row) => row.userId === "d")?.after.mu ?? 0,
    );
    expect(sorted.find((row) => row.userId === "d")?.rank).toBe(4);
    expect(sorted.find((row) => row.userId === "e")?.rank).toBe(4);
    expect(sorted.find((row) => row.userId === "d")?.after.gamesPlayed).toBe(1);
  });

  it("strong player loses to weak player and high uncertainty reacts more", () => {
    const strong = { mu: 38, sigma: 3, gamesPlayed: 10 };
    const weak = { mu: 12, sigma: 3, gamesPlayed: 10 };
    const upset = ratings([entry("weak", 1, "2"), entry("strong", 2, "1")], { strong, weak });
    expect(upset.find((row) => row.userId === "strong")?.after.mu).toBeLessThan(38);
    expect(upset.find((row) => row.userId === "weak")?.after.mu).toBeGreaterThan(12);
    const uncertain = { mu: 25, sigma: 8, gamesPlayed: 3 };
    const certain = { mu: 25, sigma: 2, gamesPlayed: 3 };
    const high = ratings([entry("a", 1, "3"), entry("b", 2, "1")], { a: uncertain, b: certain });
    const low = ratings([entry("a", 1, "3"), entry("b", 2, "1")], { a: certain, b: uncertain });
    expect(high[0].after.mu - high[0].before.mu).toBeGreaterThan(
      low[0].after.mu - low[0].before.mu,
    );
  });

  it("does not rate anyone when only one participant has a score", () => {
    expect(ratings([entry("a", 1, "1"), entry("b", null, null)])).toEqual([]);
  });

  it("inherits the pre-match global mean once, inflates group uncertainty and resets group games", () => {
    expect(initialGroupRating()).toEqual(NEW_RATING);
    expect(initialGroupRating({ mu: 40, sigma: 2, gamesPlayed: 16 })).toEqual({
      mu: 40,
      sigma: (NEW_RATING.sigma * 200) / 350,
      gamesPlayed: 0,
    });
    expect(initialGroupRating({ mu: 19, sigma: 7, gamesPlayed: 8 })).toEqual({
      mu: 19,
      sigma: NEW_RATING.sigma,
      gamesPlayed: 0,
    });
  });
});
