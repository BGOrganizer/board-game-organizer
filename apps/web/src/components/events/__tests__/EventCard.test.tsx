import type { EventResponse } from "@board-game-organizer/schemas";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";

const event: EventResponse = {
  id: "event",
  organizationId: "org",
  adminUserId: "admin",
  name: "Evening games",
  organizationName: "Game club",
  organizationApproved: true,
  logo: "",
  location: {
    id: "venue",
    name: "Club venue",
    address: "Via Roma 1, Italia",
    latitude: 41,
    longitude: 12,
  },
  startsAt: "2030-06-13T01:00:00.000Z",
  endsAt: "2030-06-13T05:00:00.000Z",
  bookingClosesAt: "2030-06-12T01:00:00.000Z",
  timeZone: "America/Los_Angeles",
  status: "PUBLISHED",
  tableCount: 20,
  confirmedParticipantCount: 3,
  role: "visitor",
  canModify: false,
  canPublish: false,
  version: 1,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
it.each([
  ["PUBLISHED", "Published", "success", true],
  ["DRAFT", "Draft", "warning", false],
  ["CANCELLED", "Cancelled", "danger", false],
] as const)(
  "renders %s with local day/time, authoritative counts and locally generated planets",
  (status, label, color, approved) => {
    const { container } = renderWithI18n(
      <EventCard event={{ ...event, status, organizationApproved: approved }} />,
    );
    const link = screen.getByRole("link", { name: /^Open event: Evening games/ });
    expect(link.getAttribute("href")).toBe("/events/event");
    expect(screen.getByText("Game club")).toBeTruthy();
    expect(Boolean(screen.queryByText("Approved organization"))).toBe(approved);
    expect(screen.getByText(label).closest(".chip")?.className).toContain(color);
    expect(screen.getByText("06/12/2030")).toBeTruthy();
    expect(screen.getByText("18:00")).toBeTruthy();
    expect(screen.getByText("22:00")).toBeTruthy();
    expect(screen.getByText("Club venue")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(container.querySelector(".lucide-layout-grid")).toBeTruthy();
    expect(container.querySelector(".lucide-users-round")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(container.querySelector("img")?.getAttribute("src") ?? "")).toContain(
      "<svg",
    );
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  },
);
