import type { PlayerPoll } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { gameBestPlayers, gameBestPlayersWithPercentage } from "../gameBestPlayers";

const row = (players: number, best = 3, recommended = 1, notRecommended = 0, orMore = false) => ({
  players,
  best,
  recommended,
  notRecommended,
  orMore,
  sampleCount: best + recommended + notRecommended,
});
const poll = (rows: PlayerPoll["rows"], totalVotes = 10): PlayerPoll => ({
  rows,
  totalVotes,
  fetchedAt: "2026-11-14T00:00:00.000Z",
});

describe("BGG Best player summary", () => {
  it("keeps absent, unvoted, tied, unsampled and non-Best recommendations unknown", () => {
    for (const value of [
      undefined,
      null,
      poll([]),
      poll([row(2)], 0),
      poll([row(2, 2, 2)]),
      poll([row(2, 0, 0)]),
      poll([row(2, 1, 3)]),
      poll([row(2, 1, 0, 3)]),
    ]) {
      expect(gameBestPlayers(value)).toBeNull();
    }
  });
  it("uses at most the first two ascending counts, deduplicates and preserves source order", () => {
    const input = poll([row(6), row(5), row(4), row(4)]);
    expect(gameBestPlayers(input)).toBe("4-5");
    expect(input.rows.map((item) => item.players)).toEqual([6, 5, 4, 4]);
    expect(gameBestPlayers(poll([row(6)]))).toBe("6");
  });
  it("preserves the provider open-ended suffix", () => {
    expect(gameBestPlayers(poll([row(6, 3, 1, 0, true)]))).toBe("6+");
  });
});

describe("BGG Best with vote share", () => {
  it("uses each exact/open-ended poll row denominator and excludes ties", () => {
    const value = poll([row(6), row(3, 4, 3, 1, true), row(2, 3, 1), row(1, 2, 2)], 25);
    expect(gameBestPlayersWithPercentage(value)).toEqual([
      { count: "2", fraction: 0.75 },
      { count: "3+", fraction: 0.5 },
    ]);
    expect(gameBestPlayersWithPercentage(null)).toEqual([]);
  });
});
