import type { PlannedTableResponse, TableLeaderboardPlayer } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { tablePlayerRatingRows } from "../tablePlayerRating";

const current: TableLeaderboardPlayer = {
  userId: "a",
  name: "A",
  avatarUrl: null,
  score: 520,
  provisional: true,
  gamesPlayed: 2,
  gamesWon: 1,
  nd: 0,
};
const table = (overrides: Partial<PlannedTableResponse> = {}) =>
  ({
    eventStatus: "CONFIRMED",
    groupId: null,
    rankingEnabled: true,
    ratingChanges: [],
    ...overrides,
  }) as PlannedTableResponse;

describe("Table player rating scopes and immutable snapshots", () => {
  it("reads both current scopes and supports truthful old-cache fallbacks", () => {
    expect(tablePlayerRatingRows(table(), "a", current)).toEqual([
      { scope: "GLOBAL", state: "current", after: 520, provisional: true },
    ]);
    expect(tablePlayerRatingRows(table(), "a")).toEqual([
      { scope: "GLOBAL", state: "unavailable" },
    ]);
    const grouped = table({ groupId: "group" });
    expect(tablePlayerRatingRows(grouped, "a", current)).toEqual([
      { scope: "GLOBAL", state: "unavailable" },
      { scope: "GROUP", state: "current", after: 520, provisional: true },
    ]);
    expect(tablePlayerRatingRows(grouped, "a")).toEqual([
      { scope: "GLOBAL", state: "unavailable" },
      { scope: "GROUP", state: "unavailable" },
    ]);
    expect(
      tablePlayerRatingRows(grouped, "a", {
        ...current,
        globalRating: { score: 540, provisional: false },
        groupRating: { score: 510, provisional: true },
      }),
    ).toEqual([
      { scope: "GLOBAL", state: "current", after: 540, provisional: false },
      { scope: "GROUP", state: "current", after: 510, provisional: true },
    ]);
  });
  it("never substitutes live ratings for before/after, and never exposes a Group scope through shared results", () => {
    const done = table({
      eventStatus: "TERMINATED",
      groupId: "group",
      results: {
        lowerWins: false,
        tieBreaks: [],
        finalizedAt: "2030-01-01T00:00:00Z",
        entries: [
          { userId: "a", score: "20", rank: 1 },
          { userId: "b", score: "10", rank: 2 },
        ],
      },
      ratingChanges: [{ userId: "a", score: 530, delta: 5, provisional: false }],
      groupRatingChanges: [{ userId: "a", score: 500, delta: -2, provisional: true }],
    });
    expect(tablePlayerRatingRows(done, "a", { ...current, score: 9999 })).toEqual([
      { scope: "GLOBAL", state: "recorded", before: 525, after: 530, delta: 5, provisional: false },
      { scope: "GROUP", state: "recorded", before: 502, after: 500, delta: -2, provisional: true },
    ]);
    expect(tablePlayerRatingRows({ ...done, sharedResultsOnly: true }, "a")).toHaveLength(1);
    expect(tablePlayerRatingRows(done, "b").map((row) => row.state)).toEqual([
      "unavailable",
      "unavailable",
    ]);
    expect(tablePlayerRatingRows({ ...done, groupRatingChanges: undefined }, "a")[1].state).toBe(
      "unavailable",
    );
  });
  it("does not fabricate historical numbers or zero deltas for unrated or insufficient outcomes", () => {
    expect(
      tablePlayerRatingRows(
        table({ eventStatus: "TERMINATED", rankingEnabled: false }),
        "a",
        current,
      ),
    ).toEqual([{ scope: "GLOBAL", state: "notUpdated" }]);
    expect(tablePlayerRatingRows(table({ eventStatus: "TERMINATED" }), "a", current)[0].state).toBe(
      "unavailable",
    );
    expect(
      tablePlayerRatingRows(
        table({
          eventStatus: "TERMINATED",
          rankingEnabled: undefined,
          results: {
            entries: [],
            lowerWins: false,
            tieBreaks: [],
            finalizedAt: "2030-01-01T00:00:00Z",
          },
        }),
        "a",
        current,
      )[0].state,
    ).toBe("unavailable");
    expect(
      tablePlayerRatingRows(
        table({
          eventStatus: "TERMINATED",
          results: {
            entries: [{ userId: "a", score: null, rank: null }],
            lowerWins: false,
            tieBreaks: [],
            finalizedAt: "2030-01-01T00:00:00Z",
          },
        }),
        "a",
      )[0].state,
    ).toBe("notUpdated");
  });
});
