import { expect, it } from "vitest";
import { eventMatchesFilters } from "../eventList";

it("reconciles renamed, ended and cancelled events against list search and period filters", () => {
  const now = Date.parse("2030-01-01T20:00:00.000Z");
  const row = {
    name: "Board Evening",
    status: "PUBLISHED" as const,
    endsAt: new Date(now + 1).toISOString(),
  };
  expect(eventMatchesFilters(row, "BOARD", ["future"], now)).toBe(true);
  expect(eventMatchesFilters(row, "Board", ["past"], now)).toBe(false);
  expect(
    eventMatchesFilters({ ...row, endsAt: new Date(now).toISOString() }, "", ["past"], now),
  ).toBe(true);
  expect(
    eventMatchesFilters({ ...row, endsAt: new Date(now - 1).toISOString() }, "", ["future"], now),
  ).toBe(false);
  expect(eventMatchesFilters(row, "Other", ["future", "past"], now)).toBe(false);
  expect(eventMatchesFilters(row, "", [], now)).toBe(false);
  expect(eventMatchesFilters({ ...row, endsAt: "invalid" }, "", ["future", "past"], now)).toBe(
    false,
  );
  expect(eventMatchesFilters({ ...row, status: "CANCELLED" }, "", ["future", "past"], now)).toBe(
    false,
  );
  expect(eventMatchesFilters(row, "", ["future", "past"])).toBe(true);
});
