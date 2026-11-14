import { expect, it } from "vitest";
import { classifyPlayerCount, type PlayerPoll, playerPollSchema } from "../models/playerPoll";

const base: PlayerPoll = {
  totalVotes: 10,
  fetchedAt: "2026-11-11T00:00:00Z",
  rows: [
    { players: 2, orMore: false, best: 7, recommended: 2, notRecommended: 1, sampleCount: 10 },
    { players: 7, orMore: true, best: 1, recommended: 7, notRecommended: 2, sampleCount: 10 },
    { players: 8, orMore: false, best: 0, recommended: 0, notRecommended: 10, sampleCount: 10 },
  ],
};
it("keeps exact and open-ended votes distinct, with unknown for absent or tied samples", () => {
  expect(playerPollSchema.parse(base)).toEqual(base);
  expect(classifyPlayerCount({ ...base, totalVotes: 0 }, 2)).toBe("UNKNOWN");
  expect(classifyPlayerCount(base, 2)).toBe("BEST");
  expect(classifyPlayerCount(base, 7)).toBe("RECOMMENDED");
  expect(classifyPlayerCount(base, 9)).toBe("RECOMMENDED");
  expect(classifyPlayerCount(base, 8)).toBe("NOT_RECOMMENDED");
  expect(classifyPlayerCount(base, 3)).toBe("UNKNOWN");
  expect(classifyPlayerCount(undefined, 2)).toBe("UNKNOWN");
  expect(classifyPlayerCount(null, 2)).toBe("UNKNOWN");
  for (const row of [
    { best: 5, recommended: 5, notRecommended: 0, sampleCount: 10 },
    { best: 0, recommended: 0, notRecommended: 0, sampleCount: 0 },
    { best: 5, recommended: 0, notRecommended: 5, sampleCount: 10 },
    { best: 0, recommended: 5, notRecommended: 5, sampleCount: 10 },
  ])
    expect(classifyPlayerCount({ ...base, rows: [{ players: 2, orMore: false, ...row }] }, 2)).toBe(
      "UNKNOWN",
    );
});
