"use client";

import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Clock3 } from "lucide-react";

export function DateTimeInfo({
  startsAt,
  endsAt,
  timeZone,
}: {
  startsAt: string;
  endsAt?: string;
  timeZone?: string;
}) {
  const { t, i18n } = useLingui();
  const date = new Intl.DateTimeFormat(i18n.locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone,
  });
  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <CalendarDays className="size-4 shrink-0" aria-hidden />
      <time dateTime={startsAt}>{date.format(new Date(startsAt))}</time>
      <Clock3 className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{t`Start time`}: </span>
      <time dateTime={startsAt}>{time.format(new Date(startsAt))}</time>
      {endsAt ? (
        <>
          <span aria-hidden>–</span>
          <span className="sr-only">{t`End time`}: </span>
          <time dateTime={endsAt}>{time.format(new Date(endsAt))}</time>
        </>
      ) : null}
    </div>
  );
}
