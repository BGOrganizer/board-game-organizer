import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "../../db";
import { tableStatisticsStages } from "../table-statistics";

describe("physical table statistics", () => {
  it("never counts all-ND, one-finisher, disabled or nonterminal table results", () => {
    const stages = tableStatisticsStages(1, null, ["user_player"]);
    expect(stages[0]).toEqual({
      $match: {
        "confirmed.gameId": 1,
        rankingEnabled: true,
        results: { $exists: true },
        removedAt: { $exists: false },
      },
    });
    expect(stages[1]).toEqual({
      $match: {
        $expr: {
          $gte: [
            {
              $size: {
                $filter: {
                  input: "$results.entries",
                  as: "entry",
                  cond: { $ne: ["$$entry.score", null] },
                },
              },
            },
            2,
          ],
        },
      },
    });
    expect(stages[2].$lookup).toMatchObject({
      from: COLLECTIONS.EVENTS,
      pipeline: [
        { $match: { status: "TERMINATED", $expr: { $eq: ["$id", "$$event"] } } },
        { $project: { _id: 0, id: 1 } },
      ],
    });
    expect(stages[5]).toEqual({ $match: { "results.entries.userId": { $in: ["user_player"] } } });
    expect(stages[6].$group).toMatchObject({
      _id: "$results.entries.userId",
      gamesPlayed: { $sum: 1 },
    });
  });
  it("restricts group statistics, but GLOBAL includes group and standalone outcomes", () => {
    expect(tableStatisticsStages(1, "group", undefined)[2].$lookup.pipeline[0].$match.groupId).toBe(
      "group",
    );
    expect(tableStatisticsStages(1, null)[2].$lookup.pipeline[0].$match).not.toHaveProperty(
      "groupId",
    );
    expect(tableStatisticsStages(1, null)).toHaveLength(6);
    expect(tableStatisticsStages(1, null, [])).toContainEqual({
      $match: { "results.entries.userId": { $in: [] } },
    });
  });
});
