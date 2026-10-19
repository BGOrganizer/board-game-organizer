"use client";
import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventRecordDay } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
export function EventCard({ event }: { event: PlannedEventResponse }) {
  const { t } = useLingui(),
    day = eventRecordDay(event, event.groupType);
  return (
    <LinkedListCard href={`/events/${event.id}`} label={`${t`Open event`}: ${event.name}`}>
      <AnimatedDicebearArtwork seed={event.id} variant="waves" />
      <ListCardBody title={event.name} titleIcon={<CalendarDays className="size-4" aria-hidden />}>
        <p className="text-sm text-default-500">
          {event.status === "PLANNING"
            ? t`Planning`
            : event.status === "CONFIRMED"
              ? t`Confirmed`
              : t`Terminated`}
          {event.groupName ? ` · ${event.groupName}` : ""}
        </p>
        <p className="text-sm">
          {day ?? t`Dates to agree`} · {event.startTime} ({event.timeZone})
        </p>
        <p className="text-sm">
          {t`Tables`}: {event.tableCount} · {t`Players`}: {event.participantCount}
        </p>
      </ListCardBody>
    </LinkedListCard>
  );
}
