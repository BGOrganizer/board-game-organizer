import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { tableCardDates, tableCardLocations } from "@board-game-organizer/shared";
import {
  type ScheduleOptionRow,
  ScheduleOptionsPopover,
} from "@/components/common/ui/ScheduleOptionsPopover";

export function EventTableSchedulePopover({
  table,
  kind,
}: {
  table: PlannedTableResponse;
  kind: "dates" | "locations";
}) {
  const rows: ScheduleOptionRow[] | undefined =
    kind === "dates"
      ? tableCardDates(table)?.map((date) => ({ id: date.id, date }))
      : tableCardLocations(table)?.map((location) => ({ id: location.id, location }));
  return (
    <ScheduleOptionsPopover
      name={table.name}
      kind={kind}
      planning={table.eventStatus === "PLANNING"}
      rows={rows}
    />
  );
}
