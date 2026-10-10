import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventWizardSummary } from "../EventWizardSummary";

const times = {
  startsAt: "2030-06-12T14:00:12.123Z",
  endsAt: "2030-06-12T20:00:34.456Z",
  timeZone: "Europe/Rome",
};
it("shows a date-only day row followed by two time-only values", () => {
  renderWithI18n(<EventWizardSummary {...times} />);
  const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: times.timeZone });
  const time = new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone: times.timeZone });
  expect(screen.getByText(date.format(new Date(times.startsAt)))).toBeTruthy();
  for (const instant of [times.startsAt, times.endsAt])
    expect(screen.getByText(time.format(new Date(instant)))).toBeTruthy();
  expect(screen.queryByText("Event name:")).toBeNull();
  expect(screen.queryByText("Event location")).toBeNull();
});
it("review orders name, day, time pair, and verified venue/address rows with icons", () => {
  const { container } = renderWithI18n(
    <EventWizardSummary
      {...times}
      name="Games night"
      location={{
        id: "venue",
        name: "Club house",
        address: "Verified street 1",
        longitude: 12,
        latitude: 45,
      }}
    />,
  );
  const rows = container.firstElementChild?.children;
  expect(rows?.length).toBe(4);
  expect(rows?.[0].textContent).toContain("Event name:Games night");
  expect(rows?.[1].textContent).toContain("Event day:");
  expect(rows?.[2].textContent).toContain("Start time");
  expect(rows?.[2].textContent).toContain("End time");
  expect(rows?.[3].textContent).toContain("Event locationClub houseVerified street 1");
  for (const row of Array.from(rows ?? []))
    expect(row.querySelector("svg[aria-hidden]")).toBeTruthy();
});
