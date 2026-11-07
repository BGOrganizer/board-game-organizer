"use client";

import type { EventSchedulePreview } from "@board-game-organizer/schemas";
import { formatLocationAddress } from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { MapPin } from "lucide-react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";

/** The Event's own schedule, shared by Event cards and personal Table cards. */
export function EventCardSchedule({ schedule }: { schedule?: EventSchedulePreview }) {
  const { t, i18n } = useLingui();
  const number = new Intl.NumberFormat(i18n.locale);
  if (!schedule)
    return (
      <div className="space-y-2" role="status" aria-label={t`Loading…`}>
        <Skeleton className="h-4 w-44 max-w-full rounded" />
        <Skeleton className="h-4 w-52 max-w-full rounded" />
      </div>
    );
  return (
    <div className="space-y-2 text-sm text-foreground">
      <div className="flex flex-wrap items-center gap-1.5">
        {schedule.localStartsAt ? (
          <DateTimeInfo startsAt={`${schedule.localStartsAt}Z`} timeZone="UTC" dateStyle="long" />
        ) : (
          <p>{t`Dates to agree`}</p>
        )}
        {schedule.dateCount > 1 ? (
          <span
            className="shrink-0 text-accent-soft-foreground"
            role="img"
            aria-label={i18n._({
              id: "event.proposedDatesCount",
              message: "{count} proposed dates",
              values: { count: number.format(schedule.dateCount) },
            })}
          >
            +{number.format(schedule.dateCount)}
          </span>
        ) : null}
      </div>
      <div className="flex items-start gap-1.5">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 break-words">
          {schedule.location ? (
            <>
              {schedule.location.name} · {formatLocationAddress(schedule.location.address)}
            </>
          ) : (
            t`Locations to agree`
          )}
        </span>
        {schedule.locationCount > 1 ? (
          <span
            className="shrink-0 text-accent-soft-foreground"
            role="img"
            aria-label={i18n._({
              id: "event.proposedLocationsCount",
              message: "{count} proposed locations",
              values: { count: number.format(schedule.locationCount) },
            })}
          >
            +{number.format(schedule.locationCount)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
