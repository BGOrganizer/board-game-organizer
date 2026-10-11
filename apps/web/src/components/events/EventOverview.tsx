"use client";

import type { EventResponse } from "@board-game-organizer/schemas";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, CalendarRange, Clock3, LayoutGrid, MapPin, UsersRound } from "lucide-react";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { InfoSection as EventInfoSection } from "@/components/common/ui/InfoSection";
import { LocationListRow } from "@/components/locations/LocationListRow";

export function EventOverview({ event }: { event: EventResponse }) {
  const { t, i18n } = useLingui();
  const numbers = new Intl.NumberFormat(i18n.locale);
  const status =
    event.status === "DRAFT"
      ? t`Draft`
      : event.status === "PUBLISHED"
        ? t`Published`
        : t`Cancelled`;
  return (
    <div className="space-y-4">
      <section className="space-y-2" aria-label={t`Event name`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CalendarRange className="size-4 shrink-0 text-default-500" aria-hidden />
              {t`Event name`}
            </h2>
            <HelpPopover label={t`Event name help`} title={t`Event name`}>
              <IconLegend
                items={[
                  {
                    icon: UsersRound,
                    description: t`Confirmed participants, counted once across active tables.`,
                  },
                  { icon: LayoutGrid, description: t`Event tables, excluding cancelled tables.` },
                ]}
              />
            </HelpPopover>
          </div>
          <Chip
            size="sm"
            color={
              event.status === "DRAFT"
                ? "warning"
                : event.status === "PUBLISHED"
                  ? "success"
                  : "danger"
            }
            variant="soft"
          >
            {status}
          </Chip>
        </div>
        <p className="break-words text-lg font-semibold">{event.name}</p>
        <div className="flex items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <UsersRound className="size-4 text-default-500" aria-hidden />
            <span className="sr-only">{t`Number of participants`}: </span>
            {numbers.format(event.confirmedParticipantCount)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LayoutGrid className="size-4 text-default-500" aria-hidden />
            <span className="sr-only">{t`Number of tables`}: </span>
            {numbers.format(event.tableCount)}
          </span>
        </div>
      </section>
      <EventInfoSection
        label={t`Date and time`}
        helpLabel={t`Event date and time help`}
        help={`${t`The event date and start/end times are shown in the event's time zone.`} ${event.timeZone}`}
        icon={CalendarDays}
      >
        <GroupedRow>
          <DateTimeInfo startsAt={event.startsAt} endsAt={event.endsAt} timeZone={event.timeZone} />
        </GroupedRow>
      </EventInfoSection>
      <EventInfoSection
        label={t`Location`}
        helpLabel={t`Event location help`}
        help={t`The verified venue and address where the event takes place.`}
        icon={MapPin}
      >
        <LocationListRow name={event.location.name} address={event.location.address} />
      </EventInfoSection>
      <EventInfoSection
        label={t`Booking deadline`}
        helpLabel={t`Booking deadline help`}
        help={`${t`After this deadline, participation and table changes are closed. Times use the event's time zone.`} ${event.timeZone}`}
        icon={Clock3}
      >
        <GroupedRow>
          <DateTimeInfo startsAt={event.bookingClosesAt} timeZone={event.timeZone} />
        </GroupedRow>
      </EventInfoSection>
    </div>
  );
}
