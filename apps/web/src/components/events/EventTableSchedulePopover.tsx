"use client";

import type { PlannedTableResponse, VerifiedLocation } from "@board-game-organizer/schemas";
import {
  formatLocationAddress,
  tableCardDates,
  tableCardLocations,
} from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, MapPin } from "lucide-react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";

type Row =
  | { id: string; date: { startsAt: string; timeZone: string } }
  | { id: string; location: VerifiedLocation };

/** Event options are capped at twenty; this local list never fetches a parent or casts a vote. */
export function EventTableSchedulePopover({
  table,
  kind,
}: {
  table: PlannedTableResponse;
  kind: "dates" | "locations";
}) {
  const { t } = useLingui();
  const dates = kind === "dates";
  const title = dates ? t`Dates and times` : t`Locations`;
  const rows: Row[] | undefined = dates
    ? tableCardDates(table)?.map((date) => ({ id: date.id, date }))
    : tableCardLocations(table)?.map((location) => ({ id: location.id, location }));
  return (
    <HelpPopover
      label={`${title}: ${table.name}`}
      title={title}
      icon={dates ? CalendarDays : MapPin}
      size="compact"
      tone={table.eventStatus === "PLANNING" ? "warning" : "success"}
      triggerClassName="bg-default"
      className="w-[min(24rem,calc(100vw-2rem))]"
    >
      <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
        {rows === undefined ? (
          <Skeleton aria-label={t`Loading…`} className="h-16 w-full rounded" />
        ) : rows.length ? (
          <GroupedList>
            {rows.map((row) => (
              <GroupedRow key={row.id}>
                {"date" in row ? (
                  <DateTimeInfo
                    startsAt={row.date.startsAt}
                    timeZone={row.date.timeZone}
                    dateStyle="long"
                  />
                ) : (
                  <>
                    <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
                    <p className="min-w-0 break-words text-foreground">
                      {formatLocationAddress(row.location.address)}
                    </p>
                  </>
                )}
              </GroupedRow>
            ))}
          </GroupedList>
        ) : (
          <p className="text-muted">{dates ? t`No date selected` : t`No location selected`}</p>
        )}
      </div>
    </HelpPopover>
  );
}
