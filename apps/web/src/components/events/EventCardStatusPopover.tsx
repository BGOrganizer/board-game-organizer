"use client";

import type { ClientEventRecord, RecordUserRole } from "@board-game-organizer/shared";
import {
  CARD_STATE_TONES,
  confirmedEventCardTables,
  eventCardState,
} from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarCheck, CalendarClock, Flag } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { cardStateMessages } from "@/lib/eventCardMessages";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { EventCardTableSummaries } from "./EventCardTableSummaries";
import { EventScheduleSummary } from "./EventScheduleSummary";

export function EventCardStatusPopover({
  event,
  roles,
}: {
  event: ClientEventRecord;
  roles: readonly RecordUserRole[];
}) {
  const { t, i18n } = useLingui();
  const state = eventCardState(event);
  const summary = event.cardSummary;
  const status = i18n._(cardStateMessages[state]);
  const confirmedTables = confirmedEventCardTables(event);
  const exclusions = summary?.tables.filter((table) => table.myParticipation === "EXCLUDED");
  return (
    <HelpPopover
      size="compact"
      label={status}
      title={status}
      icon={state === "PLANNING" ? CalendarClock : state === "TERMINATED" ? Flag : CalendarCheck}
      tone={CARD_STATE_TONES[state]}
      triggerClassName="bg-default"
      className="w-90 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto overscroll-contain"
    >
      <div className="space-y-2">
        {event.status === "CONFIRMED" ? <p>{t`The event has been confirmed.`}</p> : null}
        {event.status !== "PLANNING" ? <EventScheduleSummary event={event} /> : null}
        {confirmedTables.length > 0 ? (
          <div>
            <p className="font-bold">{t`Tables:`}</p>
            <EventCardTableSummaries tables={confirmedTables} mode="confirmed" />
          </div>
        ) : null}
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
            {state === "DUTY" ? (
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
            {state === "UNKNOWN" || (state === "CONFIRMED" && !summary) ? (
              <Skeleton aria-label={t`Loading…`} className="h-5 w-48 rounded" />
            ) : null}
          </>
        )}
      </div>
    </HelpPopover>
  );
}
