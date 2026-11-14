import type { EventSchedulePreview } from "@board-game-organizer/schemas";
import { eventRecordSchedulePreview } from "@board-game-organizer/shared";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventSchedulePopover } from "../EventSchedulePopover";
import { EventTableSchedulePopover } from "../EventTableSchedulePopover";

vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  eventRecordSchedulePreview: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it.each(["PLANNING", "CONFIRMED", "TERMINATED"] as const)(
  "shows a venue icon only for known venues, preserving direct Planning adapter behavior (%s)",
  (status) => {
    vi.mocked(eventRecordSchedulePreview).mockReturnValue({
      locationCount: 0,
      dateCount: 0,
      localStartsAt: null,
      location: null,
      locations: [],
      dates: [],
    });
    renderWithI18n(
      <EventSchedulePopover event={{ ...plannedEvent, status, locations: [] }} kind="locations" />,
    );
    expect(Boolean(screen.queryByRole("button"))).toBe(status === "PLANNING");
  },
);
it.each(["dates", "locations"] as const)(
  "retains old unknown Event %s metadata as loading rather than inventing emptiness",
  async (kind) => {
    const preview: EventSchedulePreview = {
      locationCount: 1,
      dateCount: 1,
      localStartsAt: null,
      location: null,
    };
    vi.mocked(eventRecordSchedulePreview).mockReturnValue(preview);
    renderWithI18n(
      <EventSchedulePopover event={{ ...plannedEvent, status: "CONFIRMED" }} kind={kind} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByLabelText("Loading…")).not.toBeNull();
  },
);
it.each(["dates", "locations"] as const)(
  "shows a known final Event %s projection",
  async (kind) => {
    vi.mocked(eventRecordSchedulePreview).mockReturnValue({
      locationCount: 1,
      dateCount: 1,
      localStartsAt: "2030-06-03T20:00",
      location: plannedEvent.locations[0],
      dates: [{ id: "date", localStartsAt: "2030-06-03T20:00" }],
      locations: plannedEvent.locations,
    });
    renderWithI18n(
      <EventSchedulePopover event={{ ...plannedEvent, status: "TERMINATED" }} kind={kind} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(
      await screen.findByText(kind === "dates" ? "June 3, 2030" : "Via Roma 1"),
    ).not.toBeNull();
  },
);
it.each(["CONFIRMED", "TERMINATED"] as const)(
  "hides a known-empty final Table venue but keeps unknown cached metadata loading (%s)",
  async (eventStatus) => {
    const table = {
      ...plannedTable,
      eventStatus,
      confirmed: { gameId: 1, startsAt: plannedEvent.createdAt, playerIds: [] },
    };
    const view = renderWithI18n(
      <EventTableSchedulePopover
        table={{
          ...table,
          eventSchedule: {
            localStartsAt: null,
            location: null,
            dateCount: 1,
            locationCount: 0,
            locations: [],
          },
        }}
        kind="locations"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    view.rerender(
      <EventTableSchedulePopover table={{ ...table, eventSchedule: undefined }} kind="locations" />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByLabelText("Loading…")).not.toBeNull();
  },
);
