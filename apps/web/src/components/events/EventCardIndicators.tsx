"use client";

import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  eventParticipationFlags,
  eventPendingAction,
  eventRecordSchedulePreview,
  useEventCutoff,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarCheck, CalendarClock, Flag } from "lucide-react";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { EventCardSchedule } from "./EventCardSchedule";

/** Current management, consent and duty are independent facts, never a priority-selected role. */
export function EventCardIndicators({ event }: { event: PlannedEventResponse }) {
  const { t, i18n } = useLingui();
  const participation = eventParticipationFlags(event.myRegistrations);
  const own = !event.readOnly;
  const closed = useEventCutoff(
    event.bookingClosesAt,
    event.groupType === "PUBLIC" && event.status === "PLANNING",
  );
  const planning = event.status === "PLANNING",
    confirmed = event.status === "CONFIRMED";
  const status = planning ? t`Planning` : confirmed ? t`Confirmed` : t`Terminated`;
  return (
    <>
      {own && event.canManage ? (
        <ArtworkStatusPopover
          size="compact"
          kind={event.managementRole === "admin" ? "admin" : "manager"}
          label={event.managementRole === "moderator" ? t`Group moderator` : undefined}
        />
      ) : null}
      {own && participation.accepted ? (
        <ArtworkStatusPopover size="compact" kind="accepted" />
      ) : null}
      {own && participation.pending ? (
        <ArtworkStatusPopover
          size="compact"
          kind="pending"
          action={closed ? null : eventPendingAction(event)}
        />
      ) : null}
      {own && event.myDemonstrator ? (
        <ArtworkStatusPopover size="compact" kind="demonstrator" />
      ) : null}
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={planning ? CalendarClock : confirmed ? CalendarCheck : Flag}
        tone={planning ? "warning" : confirmed ? "success" : "muted"}
        triggerClassName="bg-default"
      >
        <div className="max-h-[50vh] space-y-2 overflow-y-auto overscroll-contain">
          <p>
            {planning
              ? t`The event is being planned. Dates and locations are still proposals.`
              : confirmed
                ? t`The event has been confirmed.`
                : t`The event has finished. Results are immutable.`}
          </p>
          <EventCardSchedule schedule={eventRecordSchedulePreview(event)} />
          <p>
            {t`Players`}: {i18n.number(event.participantCount)}
          </p>
        </div>
      </HelpPopover>
    </>
  );
}
