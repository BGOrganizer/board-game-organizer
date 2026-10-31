import { expect, it } from "vitest";
import {
  eventAvailabilityVoteIsAllowed,
  eventJoinAvailabilityIsComplete,
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
const event = { dates: [{ id: "first" }, { id: "second" }], locations: [{ id: "venue" }] };
const votes = {
  dateVotes: { first: "YES" as const, second: "NO" as const },
  locationVotes: { venue: "IF_NEEDED" as const },
};
it("requires explicit legal current choices for every option and at least one accepted date/venue", () => {
  expect(eventJoinAvailabilityIsComplete(event, votes)).toBe(true);
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
    { ...votes, locationVotes: {} },
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
