import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventTableSchedulePopover } from "../EventTableSchedulePopover";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
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
