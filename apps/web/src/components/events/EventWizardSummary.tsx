"use client";
import type { MatchLocation } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, ClipboardList, Clock3, MapPin } from "lucide-react";

export function EventWizardSummary({
  startsAt,
  endsAt,
  timeZone,
  name,
  location,
}: {
  startsAt: string;
  endsAt: string;
  timeZone: string;
  name?: string;
  location?: MatchLocation;
}) {
  const { t, i18n } = useLingui();
  const date = new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium", timeZone });
  const time = new Intl.DateTimeFormat(i18n.locale, { timeStyle: "short", timeZone });
  return (
    <div className="space-y-3">
      {name !== undefined ? (
        <p className="flex items-center gap-2">
          <ClipboardList className="size-5 shrink-0 text-default-500" aria-hidden />
          <span className="text-default-500">{t`Event name`}:</span>
          <span>{name}</span>
        </p>
      ) : null}
      <p className="flex items-center gap-2">
        <CalendarDays className="size-5 shrink-0 text-default-500" aria-hidden />
        <span className="text-default-500">{t`Event day`}:</span>
        <span>{date.format(new Date(startsAt))}</span>
      </p>
      <div className="flex gap-3">
        {[
          { label: t`Start time`, value: startsAt },
          { label: t`End time`, value: endsAt },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <Clock3 className="size-5 shrink-0 text-default-500" aria-hidden />
            <span>
              <span className="block text-sm text-default-500">{label}</span>
              <span>{time.format(new Date(value))}</span>
            </span>
          </div>
        ))}
      </div>
      {location ? (
        <div className="flex items-start gap-2">
          <MapPin className="size-5 shrink-0 text-default-500" aria-hidden />
          <div>
            <p className="text-default-500">{t`Event location`}</p>
            <p>{location.name}</p>
            <p>{location.address}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
