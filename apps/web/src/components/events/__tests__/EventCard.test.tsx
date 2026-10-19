import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";

it("opens unified event and shows planning metadata without invented organizer seats", () => {
  renderWithI18n(<EventCard event={plannedEvent} />);
  expect(screen.getByRole("link", { name: "Open event: Friday games" }).getAttribute("href")).toBe(
    `/events/${plannedEvent.id}`,
  );
  expect(screen.getByText("Dates to agree", { exact: false })).not.toBeNull();
  expect(screen.getByText("Tables: 1 · Players: 0")).not.toBeNull();
});
it("shows selected local day and confirmed status", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        status: "CONFIRMED",
        confirmed: {
          dateId: plannedEvent.dates[0].id,
          locationId: plannedEvent.locations[0].id,
          at: plannedEvent.createdAt,
        },
      }}
    />,
  );
  expect(screen.getByText("Confirmed")).not.toBeNull();
  expect(screen.getByText("2030-06-03", { exact: false })).not.toBeNull();
});
it("retains terminated/group context", () => {
  renderWithI18n(
    <EventCard
      event={{ ...plannedEvent, status: "TERMINATED", groupName: "Club", groupType: "PUBLIC" }}
    />,
  );
  expect(screen.getByText("Terminated · Club")).not.toBeNull();
});
