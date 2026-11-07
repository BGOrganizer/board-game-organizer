"use client";

import { notificationItemId, type PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventRecordVisibility } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Info } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { EventStatusBadge } from "./EventStatusBadge";
import { EventVoteLegend } from "./EventVoteLegend";

export function EventDetailsCard({ event }: { event: PlannedEventResponse }) {
  const { t } = useLingui();
  return (
    <section aria-label={t`Details`} className="space-y-2">
      <div className="flex items-center gap-1">
        <Info className="size-5 text-muted" aria-hidden />
        <span className="font-bold">{t`Details`}</span>
        <EventVoteLegend />
      </div>
      <ListCard>
        <div className="flex min-w-0 items-start gap-4 p-4">
          <AnimatedDicebearArtwork seed={event.id} variant="constellation" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start gap-2">
              <div className="flex min-w-0 flex-1 basis-52 items-start gap-2">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <h1 className="min-w-0 flex-1 break-words text-base font-normal">{event.name}</h1>
                <NotificationItem itemId={notificationItemId(event.id, "overview")} readOnly />
              </div>
              <EventStatusBadge status={event.status} />
            </div>
            <p className="text-sm text-muted">
              {eventRecordVisibility(event, event.groupType) === "PUBLIC"
                ? t`Public event`
                : t`Private event`}
            </p>
          </div>
        </div>
      </ListCard>
    </section>
  );
}
