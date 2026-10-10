import { describe, expect, it } from "vitest";
import { eventPeriods, eventPeriodsSchema } from "../dto/eventList";

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
