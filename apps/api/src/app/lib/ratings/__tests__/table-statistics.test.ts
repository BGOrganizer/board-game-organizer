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
    expect(stages).toContainEqual({
      $set: {
        "results.entries": {
          $filter: {
            input: "$results.entries",
            as: "entry",
            cond: {
              $not: [
                {
                  $in: [
                    "$$entry.userId",
                    { $ifNull: ["$confirmed.guestPlayers.participantId", []] },
                  ],
                },
              ],
            },
          },
        },
      },
    });
    expect(stages).toContainEqual({
      $set: {
        registeredFinishers: {
          $filter: {
            input: "$results.entries",
            as: "entry",
            cond: { $ne: ["$$entry.score", null] },
          },
        },
      },
    });
    expect(stages).toContainEqual({
      $match: { $expr: { $gte: [{ $size: "$registeredFinishers" }, 2] } },
    });
    expect(stages).toContainEqual({
      $set: { winningRegisteredRank: { $min: "$registeredFinishers.rank" } },
    });
    expect(stages.find((stage) => stage.$lookup)?.$lookup).toMatchObject({
      from: COLLECTIONS.EVENTS,
      pipeline: [
        { $match: { status: "TERMINATED", $expr: { $eq: ["$id", "$$event"] } } },
        { $project: { _id: 0, id: 1 } },
      ],
    });
    expect(stages).toContainEqual({
      $match: { "results.entries.userId": { $in: ["user_player"] } },
    });
    expect(stages.at(-1)?.$group).toMatchObject({
      _id: "$results.entries.userId",
      gamesPlayed: { $sum: 1 },
    });
  });
  it("restricts group statistics, but GLOBAL includes group and standalone outcomes", () => {
    const eventMatch = (groupId: string | null) =>
      tableStatisticsStages(1, groupId).find((stage) => stage.$lookup)?.$lookup.pipeline[0].$match;
    expect(eventMatch("group")).toHaveProperty("groupId", "group");
    expect(eventMatch(null)).toBeDefined();
    expect(eventMatch(null)).not.toHaveProperty("groupId");
    expect(tableStatisticsStages(1, null, [])).toContainEqual({
      $match: { "results.entries.userId": { $in: [] } },
    });
  });
});
