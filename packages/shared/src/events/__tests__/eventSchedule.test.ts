import { expect, it } from "vitest";
import {
  allowedEventTimes,
  nextEventDay,
  publicEventBounds,
  publicEventEndIsValid,
  publicTableTimeBounds,
} from "../eventSchedule";

it("bounds same-day ends and combined cutoff instants to adjacent valid minutes", () => {
  expect(publicEventBounds("2030-06-03T20:00")).toEqual({
    endMin: "2030-06-03T20:01",
    endMax: "2030-06-03T23:59",
    cutoffMax: "2030-06-03T19:59",
  });
  expect(publicEventBounds("2030-01-01T00:00").cutoffMax).toBe("2029-12-31T23:59");
  expect(publicEventBounds("2030-06-03T23:59").endMin).toBe("2030-06-04T00:00");
  expect(publicEventBounds("")).toEqual({});
  expect(publicEventBounds("2030-13-01T00:00")).toEqual({});
  expect(publicEventEndIsValid("2030-06-03T20:00", "2030-06-03T20:01")).toBe(true);
  expect(publicEventEndIsValid("2030-06-03T20:00", "2030-06-03T20:00")).toBe(false);
  expect(publicEventEndIsValid("2030-06-03T20:00", "2030-06-03T20:00:00")).toBe(false);
  expect(publicEventEndIsValid("2030-06-03T20:00", "2030-06-03T20:00:30")).toBe(true);
  expect(publicEventEndIsValid("2030-06-03T20:00", "2030-06-04T00:00")).toBe(false);
});
it("fixes public table day and strictly bounds its time while reserving the entire duration", () => {
  expect(publicTableTimeBounds("2030-06-03T20:00", "2030-06-03T23:00", 60)).toEqual({
    min: "2030-06-03T20:01",
    max: "2030-06-03T22:00",
  });
  expect(publicTableTimeBounds("2030-06-03T20:00", "2030-06-03T23:00").max).toBe(
    "2030-06-03T22:59",
  );
  expect(publicTableTimeBounds("", "2030-06-03T23:00")).toEqual({});
  expect(publicTableTimeBounds("2030-06-03T20:00", "bad")).toEqual({});
  expect(publicTableTimeBounds("2030-06-03T20:00", "2030-06-03T23:00", Number.NaN)).toEqual({});
});
it("initializes tomorrow using the local calendar, including month/year boundaries", () => {
  expect(nextEventDay(new Date(2030, 11, 31, 23, 55))).toBe("2031-01-01");
  expect(nextEventDay(new Date(2030, 5, 3))).toBe("2030-06-04");
});
it("offers only allowed native minute choices, never out-of-range alternatives", () => {
  expect(allowedEventTimes("2030-06-03")).toHaveLength(1440);
  expect(allowedEventTimes("2030-06-03", "2030-06-03T20:01", "2030-06-03T20:03")).toEqual([
    "2030-06-03T20:01",
    "2030-06-03T20:02",
    "2030-06-03T20:03",
  ]);
  expect(allowedEventTimes("2030-06-03", "2030-06-04T00:00", "2030-06-03T23:59")).toEqual([]);
  expect(allowedEventTimes("2030-06-03", undefined, "2030-06-03T00:01")).toHaveLength(2);
});
