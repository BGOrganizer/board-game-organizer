"use client";

import type { ClientEventRecord } from "@board-game-organizer/shared";
import {
  CARD_STATE_TONES,
  eventCardRoles,
  eventCardState,
  eventPendingAction,
  eventRecordVisibility,
} from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarCheck, CalendarClock, Flag, Globe, LockKeyhole, Settings } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { cardStateMessages } from "@/lib/eventCardMessages";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { EventCardTableSummaries } from "./EventCardTableSummaries";
import { EventRolePopover } from "./EventRolePopover";
import { EventSchedulePopover } from "./EventSchedulePopover";

export function EventCardIndicators({ event }: { event: ClientEventRecord }) {
  const { t, i18n } = useLingui();
  const roles = eventCardRoles(event);
  const state = eventCardState(event);
  const summary = event.cardSummary;
  const status = i18n._(cardStateMessages[state]);
  const confirmedCount = summary?.tables.filter(
    (table) => table.myParticipation === "CONFIRMED",
  ).length;
  const exclusions = summary?.tables.filter((table) => table.myParticipation === "EXCLUDED");
  const publicEvent = eventRecordVisibility(event, event.groupType) === "PUBLIC";
  return (
    <>
      <EventRolePopover
        roles={roles}
        action={eventPendingAction(event)}
        pending={!!event.optimistic}
      />
      <HelpPopover
        size="compact"
        label={publicEvent ? t`Public event` : t`Private event`}
        title={publicEvent ? t`Public event` : t`Private event`}
        icon={publicEvent ? Globe : LockKeyhole}
        tone={publicEvent ? "accent" : "muted"}
        triggerClassName="bg-default"
      >
        <p>
          {publicEvent
            ? t`Authenticated users can enroll without joining the group.`
            : t`Participation is limited to authorized group members or invited users.`}
        </p>
      </HelpPopover>
      {!event.sharedResultsOnly && !event.personalAccessOnly ? (
        <HelpPopover
          size="compact"
          label={t`Settings`}
          title={t`Settings`}
          icon={Settings}
          triggerClassName="bg-default"
        >
          <div className="space-y-2">
            <p>
              <strong>{event.planningMode === "MANUAL" ? t`Manual` : t`Assisted`}</strong>:{" "}
              {event.planningMode === "MANUAL"
                ? t`Managers arrange seats and the waiting list. Confirmation requirements still apply.`
                : t`The app seeks compatible players, dates, locations and games. A manager must still confirm.`}
            </p>
            <p>
              <strong>{event.playerPreference === "BEST" ? t`BGG Best` : t`More players`}</strong>:{" "}
              {event.playerPreference === "BEST"
                ? t`Prefers the player count marked Best on BGG.`
                : t`Prefers the solution that seats more people, respecting votes and constraints.`}
            </p>
            {event.playerPreference === "BEST" &&
            event.planningMode !== "MANUAL" &&
            event.allowBestReduction ? (
              <p>{t`Assisted planning may seat fewer players to improve the BGG recommendation.`}</p>
            ) : null}
          </div>
        </HelpPopover>
      ) : null}
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={state === "PLANNING" ? CalendarClock : state === "TERMINATED" ? Flag : CalendarCheck}
        tone={CARD_STATE_TONES[state]}
        triggerClassName="bg-default"
      >
        <div className="space-y-2">
          {state === "PLANNING" ? (
            summary ? (
              <>
                <p>
                  {summary.ready
                    ? t`Ready for a manager to confirm.`
                    : t`Confirmation requirements are not yet met.`}
                </p>
                <EventCardTableSummaries tables={summary.tables} mode="planning" />
              </>
            ) : (
              <Skeleton aria-label={t`Loading…`} className="h-5 w-48 rounded" />
            )
          ) : state === "TERMINATED" ? (
            summary ? (
              <EventCardTableSummaries
                tables={summary.tables.filter((table) => table.confirmed)}
                mode="results"
              />
            ) : (
              <Skeleton aria-label={t`Loading…`} className="h-5 w-48 rounded" />
            )
          ) : (
            <>
              <p>{t`The event has been confirmed.`}</p>
              {state === "CONFIRMED" ? (
                confirmedCount === undefined ? (
                  <Skeleton aria-label={t`Loading…`} className="h-5 w-24 rounded" />
                ) : (
                  <p>
                    {t`Tables where you are confirmed`}: {i18n.number(confirmedCount)}
                  </p>
                )
              ) : state === "DUTY" ? (
                <p>{t`You have an assigned role without a player seat.`}</p>
              ) : state === "OBSERVER" ? (
                <p>{t`You are not registered.`}</p>
              ) : null}
              {state === "DUTY" ? (
                <ul>
                  {roles.map((role) => (
                    <li key={role}>{i18n._(recordUserRoleMessages[role])}</li>
                  ))}
                </ul>
              ) : null}
              {exclusions?.length ? (
                <EventCardTableSummaries tables={exclusions} mode="exclusions" />
              ) : null}
              {state === "UNKNOWN" ? (
                <Skeleton aria-label={t`Loading…`} className="h-5 w-48 rounded" />
              ) : null}
            </>
          )}
        </div>
      </HelpPopover>
      {event.status !== "PLANNING" ? (
        <>
          <EventSchedulePopover event={event} kind="locations" />
          <EventSchedulePopover event={event} kind="dates" />
        </>
      ) : null}
    </>
  );
}
