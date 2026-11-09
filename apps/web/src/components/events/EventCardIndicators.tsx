"use client";

import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import {
  eventParticipationFlags,
  eventPendingAction,
  eventRecordVisibility,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarCheck, CalendarClock, Flag, Globe, LockKeyhole, UsersRound } from "lucide-react";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { EventSchedulePopover } from "./EventSchedulePopover";

/** Current management, consent and duty are independent facts, never a priority-selected role. */
export function EventCardIndicators({ event }: { event: PlannedEventResponse }) {
  const { t, i18n } = useLingui();
  const participation = eventParticipationFlags(event.myRegistrations);
  const own = !event.readOnly;
  const planning = event.status === "PLANNING",
    confirmed = event.status === "CONFIRMED";
  const status = planning ? t`Planning` : confirmed ? t`Confirmed` : t`Terminated`;
  return (
    <>
      {own && event.canManage && event.managementRole ? (
        <ArtworkStatusPopover
          size="compact"
          kind={event.managementRole === "admin" ? "admin" : "manager"}
          label={event.managementRole === "moderator" ? t`Moderator` : t`Admin`}
        />
      ) : null}
      {own && participation.accepted ? (
        <ArtworkStatusPopover size="compact" kind="accepted" label={t`Accepted participant`} />
      ) : null}
      {own &&
      event.myRegistrations.some((row) => row.status === "PENDING" && row.kind === "INVITATION") ? (
        <ArtworkStatusPopover
          size="compact"
          kind="pending"
          label={t`Participant with pending invitation`}
          action={eventPendingAction(event)}
        />
      ) : null}
      {own && participation.waiting ? (
        <ArtworkStatusPopover
          size="compact"
          kind="waiting"
          label={t`Participant on the waiting list`}
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
          <p className="flex items-center gap-2">
            <UsersRound aria-hidden className="size-4 shrink-0 text-muted" />
            {t`Players`}: {i18n.number(event.participantCount)}
          </p>
        </div>
      </HelpPopover>
      <HelpPopover
        size="compact"
        label={
          eventRecordVisibility(event, event.groupType) === "PUBLIC"
            ? t`Public event`
            : t`Private event`
        }
        title={
          eventRecordVisibility(event, event.groupType) === "PUBLIC"
            ? t`Public event`
            : t`Private event`
        }
        icon={eventRecordVisibility(event, event.groupType) === "PUBLIC" ? Globe : LockKeyhole}
        tone={eventRecordVisibility(event, event.groupType) === "PUBLIC" ? "accent" : "muted"}
        triggerClassName="bg-default"
      >
        <p>
          {eventRecordVisibility(event, event.groupType) === "PUBLIC"
            ? t`Authenticated users can enroll without joining the group.`
            : t`Participation is limited to authorized group members or invited users.`}
        </p>
      </HelpPopover>
      <EventSchedulePopover event={event} kind="dates" />
      <EventSchedulePopover event={event} kind="locations" />
    </>
  );
}
