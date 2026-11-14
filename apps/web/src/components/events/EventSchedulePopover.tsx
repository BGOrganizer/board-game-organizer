"use client";
import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventRecordSchedulePreview } from "@board-game-organizer/shared";
import {
  type ScheduleOptionRow,
  ScheduleOptionsPopover,
} from "@/components/common/ui/ScheduleOptionsPopover";

export function EventSchedulePopover({
  event,
  kind,
}: {
  event: PlannedEventResponse;
  kind: "dates" | "locations";
}) {
  const schedule = eventRecordSchedulePreview(event);
  const rows: ScheduleOptionRow[] | undefined =
    kind === "dates"
      ? schedule.dates?.map((date) => ({
          id: date.id,
          date: { startsAt: `${date.localStartsAt}Z`, timeZone: "UTC" },
        }))
      : schedule.locations?.map((location) => ({ id: location.id, location }));
  return (
    <ScheduleOptionsPopover
      name={event.name}
      kind={kind}
      planning={event.status === "PLANNING"}
      rows={rows}
    />
  );
}
