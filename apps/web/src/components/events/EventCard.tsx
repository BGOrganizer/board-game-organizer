"use client";
import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventDateWall, eventRecordPreviewDate } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, UsersRound } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { EventStatusBadge } from "./EventStatusBadge";
export function EventCard({ event }: { event: PlannedEventResponse }) {
  const { t, i18n } = useLingui(),
    date = eventRecordPreviewDate(event),
    number = new Intl.NumberFormat(i18n.locale);
  const planning = event.status === "PLANNING";
  return (
    <LinkedListCard href={`/events/${event.id}`} label={`${t`Open event`}: ${event.name}`}>
      <AnimatedDicebearArtwork seed={event.id} variant="constellation" />
      <ListCardBody
        title={event.name}
        titleIcon={<CalendarDays className="size-4 shrink-0" aria-hidden />}
        titleAccessory={<EventStatusBadge status={event.status} />}
      >
        {event.groupName ? (
          <p className="flex items-center gap-1 text-sm text-default-500">
            <UsersRound className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{event.groupName}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {date ? (
            <div className="min-w-0">
              <DateTimeInfo startsAt={`${eventDateWall(event, date)}Z`} timeZone="UTC" />
            </div>
          ) : (
            <p>{t`Dates to agree`}</p>
          )}
          {planning && event.dates.length > 1 ? (
            <span
              className="text-accent"
              role="img"
              aria-label={i18n._({
                id: "event.proposedDatesCount",
                message: "{count} proposed dates",
                values: { count: number.format(event.dates.length) },
              })}
            >
              +{number.format(event.dates.length)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1">
            <Dices className="size-4 text-default-500" aria-hidden />
            {t`Tables`}: {number.format(event.tableCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <UsersRound className="size-4 text-default-500" aria-hidden />
            {t`Players`}: {number.format(event.participantCount)}
          </span>
        </div>
      </ListCardBody>
    </LinkedListCard>
  );
}
