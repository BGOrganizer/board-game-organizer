import { describe, expect, it } from "vitest";
import {
  compareMatchScores,
  normalizeMatchScore,
  previewMatchResults,
  rankMatchResults,
} from "../matchResults";

const people = ["a", "b", "c"];

describe("match results", () => {
  it("normalizes signed, comma-separated decimals without losing precision", () => {
    expect(normalizeMatchScore(" -01 ")).toBeNull();
    expect(normalizeMatchScore("-0,50")).toBe("-0.5");
    expect(normalizeMatchScore("1.500")).toBe("1.5");
    expect(normalizeMatchScore("-0.000")).toBe("0");
    expect(normalizeMatchScore("12.3.4")).toBeNull();
    expect(normalizeMatchScore("1".repeat(49))).toBeNull();
    expect(compareMatchScores("-1.50", "-1.5")).toBe(0);
    expect(compareMatchScores("-0.5", "0")).toBe(-1);
    expect(compareMatchScores("1.501", "1.5")).toBe(1);
  });

  it("sorts high/low, competition ties, tie-break order and ND last", () => {
    const entries = [
      { userId: "a", score: "2.5" },
      { userId: "b", score: "-3.5" },
      { userId: "c", score: "2.5" },
      { userId: "nd", score: null },
    ];
    expect(
      rankMatchResults({ entries, lowerWins: false, tieBreaks: [] }).map((row) => [
        row.userId,
        row.rank,
      ]),
    ).toEqual([
      ["a", 1],
      ["c", 1],
      ["b", 3],
      ["nd", null],
    ]);
    expect(
      rankMatchResults({
        entries,
        lowerWins: true,
        tieBreaks: [{ score: "2.5", orderedUserIds: ["c", "a"] }],
      }).map((row) => [row.userId, row.rank]),
    ).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
      ["nd", null],
    ]);
  });

  it("keeps multiple nonparticipants together at the bottom", () => {
    expect(
      rankMatchResults({
        lowerWins: false,
        tieBreaks: [],
        entries: [
          { userId: "nd1", score: null },
          { userId: "active", score: "0" },
          { userId: "nd2", score: null },
        ],
      }).map((entry) => entry.userId),
    ).toEqual(["active", "nd1", "nd2"]);
  });

  it("supports optional tie-breaks of three and clears stale groups", () => {
    const rows = people.map((userId) => ({ userId, rawScore: "10", notParticipated: false }));
    const tieBreaks = [{ score: "10", orderedUserIds: ["c", "a", "b"] }];
    const ranked = previewMatchResults(rows, false, tieBreaks);
    expect(ranked.valid).toBe(true);
    expect(ranked.ranked.map((row) => row.userId)).toEqual(["c", "a", "b"]);
    expect(
      previewMatchResults([{ ...rows[0], rawScore: "" }, rows[1], rows[2]], false, tieBreaks),
    ).toMatchObject({ valid: false, tieBreaks: [] });
    expect(
      previewMatchResults(
        [{ ...rows[0], notParticipated: true }, rows[1], rows[2]],
        false,
        tieBreaks,
      ).ranked.at(-1),
    ).toMatchObject({ score: null, rank: null });
    expect(
      previewMatchResults(
        rows.map((row) => ({ ...row, notParticipated: true })),
        false,
        [],
      ).valid,
    ).toBe(false);
  });
});
