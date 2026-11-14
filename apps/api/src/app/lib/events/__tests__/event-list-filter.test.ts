import { expect, it, vi } from "vitest";
import { eventListPeriods, eventPeriodFilter } from "../event-list-filter";

it("filters event end instants: ongoing events are future, exact end is past", () => {
  const now = "2030-01-01T20:00:00.000Z";
  expect(eventPeriodFilter([], now)).toEqual({ $expr: false });
  expect(eventPeriodFilter(["future"], now)).toEqual({ $or: [{ endsAt: { $gt: now } }] });
  expect(eventPeriodFilter(["past"], now)).toEqual({ $or: [{ endsAt: { $lte: now } }] });
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date(now));
    expect(eventPeriodFilter(["future", "past"])).toEqual({
      $or: [{ endsAt: { $gt: now } }, { endsAt: { $lte: now } }],
    });
  } finally {
    vi.useRealTimers();
  }
});
it("validates the same period input for personal and organization event endpoints", () => {
  for (const path of ["events", "organizations/org/events"]) {
    const req = (query = "") => new Request(`https://api.test/api/${path}${query}`);
    expect(eventListPeriods(req())).toEqual(["future", "past"]);
    expect(eventListPeriods(req("?periods="))).toEqual([]);
    expect(eventListPeriods(req("?periods=past"))).toEqual(["past"]);
    expect(() => eventListPeriods(req("?periods=other"))).toThrow("INVALID_PERIODS");
  }
});
