import { describe, expect, it } from "vitest";
import {
  eventListStatuses,
  eventListStatusesSchema,
  eventPeriods,
  eventPeriodsSchema,
} from "../dto/eventList";

it("normalizes explicit lifecycle selections, including all-off and repeated values", () => {
  expect(eventListStatusesSchema.parse("TERMINATED,PLANNING,CONFIRMED")).toEqual(eventListStatuses);
  expect(eventListStatusesSchema.parse("")).toEqual([]);
  expect(eventListStatusesSchema.parse("PLANNING")).toEqual(["PLANNING"]);
  expect(eventListStatusesSchema.parse("CONFIRMED,CONFIRMED")).toEqual(["CONFIRMED"]);
});
it.each([
  "DRAFT",
  "confirmed",
  "CONFIRMED, PLANNING",
  "CONFIRMED,",
  "PLANNING,PLANNING,PLANNING,PLANNING",
  "x".repeat(101),
  null,
  undefined,
  [],
])("rejects invalid lifecycle filters %j", (value) => {
  expect(eventListStatusesSchema.safeParse(value).success).toBe(false);
});

describe("event list periods", () => {
  it("defaults to both periods and accepts explicit empty and individual selections", () => {
    expect(eventPeriodsSchema.parse(undefined)).toEqual(eventPeriods);
    expect(eventPeriodsSchema.parse("")).toEqual([]);
    expect(eventPeriodsSchema.parse("past")).toEqual(["past"]);
    expect(eventPeriodsSchema.parse("future,past")).toEqual(eventPeriods);
  });
  it.each(["ongoing", "future, past", "future,past,future", "x".repeat(51), null, []])(
    "rejects invalid periods %j",
    (value) => {
      expect(eventPeriodsSchema.safeParse(value).success).toBe(false);
    },
  );
});
