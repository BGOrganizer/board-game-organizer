import { expect, it } from "vitest";
import { groupBanDeadline } from "../groupBanForm";

it("requires a strictly future real instant without turning invalid or DST-gap input into a permanent ban", () => {
  const now = Date.parse("2027-03-28T00:00:00Z");
  expect(groupBanDeadline(false, "", "invalid", now)).toBeNull();
  expect(groupBanDeadline(true, "2027-03-28T01:00", "Europe/Rome", now)).toBeUndefined();
  expect(groupBanDeadline(true, "2027-03-27T01:00", "Europe/Rome", now)).toBeUndefined();
  expect(groupBanDeadline(true, "2027-03-28T02:30", "Europe/Rome", now)).toBeUndefined();
  expect(groupBanDeadline(true, "", "UTC", now)).toBeUndefined();
  expect(groupBanDeadline(true, "2027-03-28T04:30", "Europe/Rome", now)).toBe(
    "2027-03-28T02:30:00.000Z",
  );
});
