import { expect, it } from "vitest";
import {
  nextEventDay,
  publicEventBounds,
  publicEventEndIsValid,
  publicTableTimeBounds,
} from "../eventSchedule";

it("bounds same-day ends and limits registration to days before the event", () => {
  expect(publicEventBounds("2030-06-03T20:00")).toEqual({
    endMin: "2030-06-03T20:01",
    endMax: "2030-06-03T23:59",
    cutoffMax: "2030-06-02T23:59",
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
it("includes event start and the latest full-duration start in public table bounds", () => {
  expect(publicTableTimeBounds("2030-06-03T20:00", "2030-06-03T23:00", 60)).toEqual({
    min: "2030-06-03T20:00",
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
it("keeps cutoff calendar bounds correct across leap days and venue wall-clock days", () => {
  expect(publicEventBounds("2032-03-01T10:30").cutoffMax).toBe("2032-02-29T23:59");
  expect(publicEventBounds("2030-06-03T00:01").cutoffMax).toBe("2030-06-02T23:59");
  expect(publicTableTimeBounds("2030-06-03T10:30", "2030-06-03T11:30", 60)).toEqual({
    min: "2030-06-03T10:30",
    max: "2030-06-03T10:30",
  });
});
