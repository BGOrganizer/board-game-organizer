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
  expect(screen.getByText("06/03/30")).not.toBeNull();
  expect(screen.getByText("Tables: 1")).not.toBeNull();
  expect(screen.getByText("Players: 0")).not.toBeNull();
  expect(screen.getByText("Planning").closest(".chip")?.className).toContain("chip--warning");
  expect(
    screen.getByText("Planning").closest(".chip")?.querySelector("svg.lucide-clock-3"),
  ).not.toBeNull();
  expect(screen.getByText("Tables: 1").querySelector("svg.lucide-dices")).not.toBeNull();
  expect(screen.getByText("Players: 0").querySelector("svg.lucide-users-round")).not.toBeNull();
});
it("shows the first proposal, total date count and each selected clock without treating it as confirmation", () => {
  renderWithI18n(
    <EventCard
      event={{
        ...plannedEvent,
        groupType: "PRIVATE",
        locations: [
          ...plannedEvent.locations,
          { ...plannedEvent.locations[0], id: plannedEvent.id, timeZone: "America/New_York" },
        ],
        dates: [
          { ...plannedEvent.dates[0], startTime: "18:15" },
          { id: plannedEvent.id, day: "2030-06-04", startTime: "21:30" },
        ],
      }}
    />,
  );
  const day = screen.getByText("06/03/30"),
    time = screen.getByText(
      new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(
        new Date("2030-06-03T18:15:00Z"),
      ),
    );
  expect(day.previousElementSibling?.classList.contains("lucide-calendar-days")).toBe(true);
  expect(time.parentElement?.querySelector("svg.lucide-clock-3")).not.toBeNull();
  expect(screen.getByRole("img", { name: "2 proposed dates" }).textContent).toBe("+2");
  expect(screen.queryByText(/Europe\/Rome|America\/New_York/)).toBeNull();
});
it("keeps incomplete summaries safe instead of inventing a date", () => {
  renderWithI18n(<EventCard event={{ ...plannedEvent, dates: [] }} />);
  expect(screen.getByText("Dates to agree", { exact: false })).not.toBeNull();
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
  expect(screen.getByText("Confirmed").closest(".chip")?.className).toContain("chip--success");
  expect(screen.queryByText(/^\+\d/)).toBeNull();
  expect(screen.getByText("06/03/30")).not.toBeNull();
});
it("retains terminated/group context", () => {
  renderWithI18n(
    <EventCard
      event={{ ...plannedEvent, status: "TERMINATED", groupName: "Club", groupType: "PUBLIC" }}
    />,
  );
  expect(screen.getByText("Terminated")).not.toBeNull();
  const group = screen.getByText("Club");
  expect(group.previousElementSibling?.classList.contains("lucide-users-round")).toBe(true);
  expect(screen.queryByText(/Europe\/Rome/)).toBeNull();
});
