import { describe, expect, it } from "vitest";
import { eventPeriodStages } from "../event-periods";

describe("source-paged event periods", () => {
  it("does not filter an unspecified/full selection and returns nothing for empty selection", () => {
    expect(eventPeriodStages(undefined, 0)).toEqual([]);
    expect(eventPeriodStages(["past", "future"], 0)).toEqual([]);
    expect(eventPeriodStages([], 0)).toEqual([{ $match: { id: { $in: [] } } }]);
  });
  it("uses stored timezone and selected local day, keeping unselected dates in both periods", () => {
    const past = eventPeriodStages(["past"], 0)[0].$match.$expr.$let;
    expect(past.in.$or).toEqual([
      { $eq: ["$$day", null] },
      {
        $lt: [
          "$$day",
          { $dateToString: { date: new Date(0), timezone: "$timeZone", format: "%Y-%m-%d" } },
        ],
      },
    ]);
    const future = eventPeriodStages(["future"], 0, "event.")[0].$match.$expr.$let;
    expect(future.in.$or[1].$gte[1].$dateToString.timezone).toBe("$event.timeZone");
    expect(JSON.stringify(future.vars.day)).toContain("$event.confirmed.dateId");
    expect(JSON.stringify(future.vars.day)).toContain("PLANNING");
    expect(JSON.stringify(future.vars.day)).toContain("PUBLIC");
  });
});
