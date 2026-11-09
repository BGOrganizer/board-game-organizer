import { expect, it } from "vitest";
import {
  eventAvailabilityVoteIsAllowed,
  eventFirstInvalidVote,
  eventJoinAvailabilityIsComplete,
  eventOptionsRequireVote,
  eventOptionVotesAreComplete,
  eventVotingChoices,
  hasOtherAcceptedTable,
} from "../eventJoinAvailability";

it("only another accepted Table avoids repeated enrollment preferences", () => {
  expect(hasOtherAcceptedTable([], "one")).toBe(false);
  expect(
    hasOtherAcceptedTable(
      [
        { tableId: "one", status: "ACCEPTED" },
        { tableId: "two", status: "PENDING" },
      ],
      "one",
    ),
  ).toBe(false);
  expect(
    hasOtherAcceptedTable(
      [
        { tableId: "two", status: "CANCELLED" },
        { tableId: "two", status: "DECLINED" },
      ],
      "one",
    ),
  ).toBe(false);
  expect(hasOtherAcceptedTable([{ tableId: "two", status: "ACCEPTED" }], "one")).toBe(true);
});
it("preserves a positive choice in the same dimension and ignores removed options", () => {
  const options = [{ id: "one" }, { id: "two" }];
  for (const current of ["YES", "IF_NEEDED"] as const) {
    expect(eventAvailabilityVoteIsAllowed(options, { one: current }, "one", "NO")).toBe(false);
    expect(eventAvailabilityVoteIsAllowed(options, { one: current }, "one", "YES")).toBe(true);
    expect(eventAvailabilityVoteIsAllowed(options, { one: current }, "one", "IF_NEEDED")).toBe(
      true,
    );
    expect(eventAvailabilityVoteIsAllowed(options, { one: current }, "two", "NO")).toBe(true);
    expect(eventAvailabilityVoteIsAllowed(options, { two: current }, "one", "NO")).toBe(true);
  }
  expect(eventAvailabilityVoteIsAllowed(options, { removed: "YES", one: "NO" }, "one", "NO")).toBe(
    false,
  );
  expect(eventAvailabilityVoteIsAllowed(options, { one: "YES" }, "one", "UNKNOWN")).toBe(false);
  expect(eventAvailabilityVoteIsAllowed(options, { one: "YES" }, "missing", "YES")).toBe(false);
  expect(eventAvailabilityVoteIsAllowed(options, {}, "one", "NO")).toBe(false);
});
it("omits singleton preferences without weakening foreign/missing/negative multi-option validation", () => {
  const one = [{ id: "one" }],
    many = [...one, { id: "two" }];
  expect(eventOptionsRequireVote([])).toBe(false);
  expect(eventOptionsRequireVote(one)).toBe(false);
  expect(eventOptionsRequireVote(many)).toBe(true);
  expect(eventOptionVotesAreComplete(one, {})).toBe(true);
  for (const vote of ["YES", "IF_NEEDED"] as const)
    expect(eventOptionVotesAreComplete(one, { one: vote })).toBe(true);
  for (const choices of [
    { one: "NO" },
    { one: "UNKNOWN" },
    { other: "YES" },
    { one: "YES", other: "YES" },
  ] as const)
    expect(eventOptionVotesAreComplete(one, choices)).toBe(false);
  expect(eventOptionVotesAreComplete(many, {})).toBe(false);
  expect(eventOptionVotesAreComplete([], {})).toBe(false);
  for (const vote of ["YES", "IF_NEEDED", "NO", "UNKNOWN"] as const)
    expect(eventAvailabilityVoteIsAllowed(one, {}, "one", vote)).toBe(false);
  const choices = { one: "YES", two: "NO", removed: "YES" } as const;
  expect(eventVotingChoices(one, choices)).toEqual({});
  expect(eventVotingChoices([], choices)).toEqual({});
  expect(eventVotingChoices(many, choices)).toEqual({ one: "YES", two: "NO" });
  expect(eventVotingChoices(many, { one: "YES" })).toEqual({ one: "YES" });
  expect(choices).toEqual({ one: "YES", two: "NO", removed: "YES" });
});
it("points to missing ballots before all-negative or stale sets without mutating choices", () => {
  const options = [{ id: "first" }, { id: "second" }];
  expect(eventFirstInvalidVote([], {})).toBeUndefined();
  expect(eventFirstInvalidVote([options[0]], {})).toBeUndefined();
  expect(eventFirstInvalidVote(options, { first: "YES", second: "NO" })).toBeUndefined();
  expect(eventFirstInvalidVote(options, { first: "IF_NEEDED", second: "NO" })).toBeUndefined();
  const partial = { first: "YES" } as const;
  expect(eventFirstInvalidVote(options, partial)).toBe(1);
  expect(partial).toEqual({ first: "YES" });
  expect(eventFirstInvalidVote(options, { first: "UNKNOWN", second: "YES" })).toBe(0);
  expect(eventFirstInvalidVote(options, { first: "NO", second: "NO" })).toBe(0);
  expect(eventFirstInvalidVote(options, { first: "YES", second: "NO", stale: "NO" })).toBe(0);
});
const event = { dates: [{ id: "first" }, { id: "second" }], locations: [{ id: "venue" }] };
const votes = {
  dateVotes: { first: "YES" as const, second: "NO" as const },
  locationVotes: { venue: "IF_NEEDED" as const },
};
it("requires complete legal multi-option choices while singleton locations need no ballot", () => {
  expect(eventJoinAvailabilityIsComplete(event, votes)).toBe(true);
  expect(eventJoinAvailabilityIsComplete(event, { ...votes, locationVotes: {} })).toBe(true);
  expect(
    eventJoinAvailabilityIsComplete(event, {
      ...votes,
      dateVotes: { first: "NO", second: "IF_NEEDED" },
    }),
  ).toBe(true);
  expect(
    eventJoinAvailabilityIsComplete(event, { ...votes, locationVotes: { venue: "YES" } }),
  ).toBe(true);
  for (const invalid of [
    { ...votes, dateVotes: {} },
    { ...votes, dateVotes: { first: "YES" } },
    { ...votes, dateVotes: { first: "NO", second: "NO" } },
    { ...votes, dateVotes: { first: "YES", stale: "NO" } },
    { ...votes, locationVotes: { venue: "NO" } },
    { ...votes, dateVotes: { first: "UNKNOWN", second: "YES" } },
    { ...votes, locationVotes: { venue: "YES", stale: "NO" } },
  ])
    expect(eventJoinAvailabilityIsComplete(event, invalid as never)).toBe(false);
  expect(eventJoinAvailabilityIsComplete({ ...event, dates: [] }, votes)).toBe(false);
  expect(
    eventJoinAvailabilityIsComplete({ ...event, locations: [] }, { ...votes, locationVotes: {} }),
  ).toBe(false);
});
