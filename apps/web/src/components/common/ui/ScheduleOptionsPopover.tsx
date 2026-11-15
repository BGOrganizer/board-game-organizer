"use client";

import type { VerifiedLocation } from "@board-game-organizer/schemas";
import { formatLocationAddress } from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, MapPin } from "lucide-react";
import { DateTimeInfo } from "./DateTimeInfo";
import { GroupedList } from "./GroupedList";
import { GroupedRow } from "./GroupedRow";
import { HelpPopover } from "./HelpPopover";

export type ScheduleOptionRow =
  | { id: string; date: { startsAt: string; timeZone: string } }
  | { id: string; location: VerifiedLocation };

/** Authorized, bounded local options only; this control neither fetches nor votes. */
export function ScheduleOptionsPopover({
  name,
  kind,
  planning,
  rows,
}: {
  name: string;
  kind: "dates" | "locations";
  planning: boolean;
  rows: ScheduleOptionRow[] | undefined;
}) {
  const { t } = useLingui();
  const dates = kind === "dates";
  const title = dates ? t`Dates and times` : t`Locations`;
  return (
    <HelpPopover
      label={`${title}: ${name}`}
      title={title}
      icon={dates ? CalendarDays : MapPin}
      size="compact"
      tone={planning ? "warning" : "success"}
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
