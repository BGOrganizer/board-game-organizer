"use client";

import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventParticipation, eventRecordVisibility } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { ListCard } from "@/components/common/ui/ListCard";
import { EventStatusBadge } from "./EventStatusBadge";

export function EventDetailsCard({ event }: { event: PlannedEventResponse }) {
  const { t } = useLingui();
  const participation = eventParticipation(event.myRegistrations);
  const manager = !event.readOnly && (event.canManage ?? event.role === "admin");
  return (
    <section aria-label={t`Details`}>
      <ListCard
        background={
          <AnimatedDicebearArtwork
            seed={event.id}
            variant="constellation"
            presentation="background"
          />
        }
      >
        <div className="flex flex-wrap items-start gap-2">
          <CalendarDays className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
          <h1 className="min-w-0 flex-1 break-words text-lg font-semibold">{event.name}</h1>
          <EventStatusBadge status={event.status} />
        </div>
        <p className="text-sm text-muted">
          {eventRecordVisibility(event, event.groupType) === "PUBLIC"
            ? t`Public event`
            : t`Private event`}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {manager ? <ArtworkStatusPopover kind="manager" /> : null}
          {participation !== null ? (
            <ArtworkStatusPopover kind={participation} />
          ) : !manager ? (
            <ArtworkStatusPopover kind={event.role === "member" ? "member" : "viewer"} />
          ) : null}
          {event.myDemonstrator ? <ArtworkStatusPopover kind="demonstrator" /> : null}
        </div>
      </ListCard>
    </section>
  );
}
