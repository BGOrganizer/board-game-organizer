import { expect, it } from "vitest";
import { changeEventVoteCounts, eventVoteCounts } from "../eventVotes";

it("counts accepted supplied ballots per option, including missing preferences as UNKNOWN", () => {
  const ballots = [{ a: "YES", b: "IF_NEEDED" }, { a: "NO" }, { a: "UNKNOWN", b: "YES" }] as const;
  expect(eventVoteCounts(["a", "b"], ballots)).toEqual({
    a: { YES: 1, NO: 1, IF_NEEDED: 0, UNKNOWN: 1 },
    b: { YES: 1, NO: 0, IF_NEEDED: 1, UNKNOWN: 1 },
  });
  expect(eventVoteCounts(["a"], [])).toEqual({ a: { YES: 0, NO: 0, IF_NEEDED: 0, UNKNOWN: 0 } });
  expect(eventVoteCounts([], ballots)).toEqual({});
});
it("projects a known voter's change immutably and never fabricates missing aggregate data", () => {
  const before = { a: { YES: 1, NO: 0, IF_NEEDED: 0, UNKNOWN: 1 } };
  const after = changeEventVoteCounts(before, "a", "UNKNOWN", "YES");
  expect(after).toEqual({ a: { YES: 2, NO: 0, IF_NEEDED: 0, UNKNOWN: 0 } });
  expect(before.a.UNKNOWN).toBe(1);
  expect(changeEventVoteCounts(before, "a", "YES", "YES")).toBe(before);
  expect(changeEventVoteCounts(before, "absent", "UNKNOWN", "NO")).toBe(before);
  expect(changeEventVoteCounts(undefined, "a", "UNKNOWN", "NO")).toBeUndefined();
  expect(changeEventVoteCounts(before, "a", "NO", "IF_NEEDED")?.a.NO).toBe(0);
});
