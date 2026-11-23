"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { tableCardDates, tableCardLocations } from "@board-game-organizer/shared";
import {
  type ScheduleOptionRow,
  ScheduleOptionsPopover,
} from "@/components/common/ui/ScheduleOptionsPopover";

import { useTableTitle } from "@/lib/useTableTitle";
export function EventTableSchedulePopover({
  table,
  kind,
}: {
  table: PlannedTableResponse;
  kind: "dates" | "locations";
}) {
  const { getTableTitle } = useTableTitle();
  const title = getTableTitle(table);
  const rows: ScheduleOptionRow[] | undefined =
    kind === "dates"
      ? tableCardDates(table)?.map((date) => ({ id: date.id, date }))
      : tableCardLocations(table)?.map((location) => ({ id: location.id, location }));
  if (kind === "locations" && table.eventStatus !== "PLANNING" && rows?.length === 0) return null;
  return (
    <ScheduleOptionsPopover
      name={title}
      kind={kind}
      planning={table.eventStatus === "PLANNING"}
      rows={rows}
    />
  );
}
