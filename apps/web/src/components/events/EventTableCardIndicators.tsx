"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  CARD_STATE_TONES,
  tableCardGames,
  tableCardRoles,
  tableCardState,
  tablePendingAction,
} from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  CalendarCheck,
  CalendarClock,
  Flag,
  ListOrdered,
  Mail,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { cardStateMessages } from "@/lib/eventCardMessages";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventCardTableSummaries } from "./EventCardTableSummaries";
import { EventRolePopover } from "./EventRolePopover";
import { EventTableGamesPopover } from "./EventTableGamesPopover";
import { EventTableRatingInfo } from "./EventTableRatingInfo";
import { EventTableSchedulePopover } from "./EventTableSchedulePopover";

export function EventTableCardIndicators({ table }: { table: PlannedTableResponse }) {
  const { t, i18n } = useLingui();
  const { userId } = useCommunityApi();
  const roles = tableCardRoles(table, userId);
  const state = tableCardState(table, userId);
  const summary = table.cardSummary;
  const status = i18n._(cardStateMessages[state]);
  const variant =
    state === "TABLE_EXCLUDED" ? "danger" : state === "EXCLUDED" ? "danger-soft" : "ghost";
  const counts = [
    { label: t`Minimum players`, value: table.minPlayers, Icon: UsersRound },
    { label: t`Maximum players`, value: table.maxPlayers, Icon: UsersRound },
    { label: t`Accepted players`, value: table.acceptedCount, Icon: UserRoundCheck },
    { label: t`Waiting list`, value: table.waitingCount, Icon: ListOrdered },
    { label: t`Unconfirmed players`, value: table.pendingRegistrationCount, Icon: Mail },
  ];
  return (
    <>
      <EventRolePopover roles={roles} action={tablePendingAction(table)} />
      <EventTableRatingInfo enabled={table.rankingEnabled} />
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={state === "PLANNING" ? CalendarClock : state === "TERMINATED" ? Flag : CalendarCheck}
        tone={CARD_STATE_TONES[state]}
        className="w-90 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto overscroll-contain"
        triggerVariant={variant}
        triggerClassName={variant === "ghost" ? "bg-default" : ""}
      >
        <div className="space-y-2">
          {state === "TERMINATED" ? (
            summary ? (
              <EventCardTableSummaries tables={[summary]} mode="results" showNames={false} />
            ) : (
              <Skeleton aria-label={t`Loading…`} className="h-5 w-48 rounded" />
            )
          ) : (
            <>
              {state === "PLANNING" ? (
                summary ? (
                  <>
                    <p>
                      {summary.ready
                        ? t`Ready for a manager to confirm.`
                        : t`Confirmation requirements are not yet met.`}
                    </p>
                    <EventCardTableSummaries tables={[summary]} mode="planning" showNames={false} />
                  </>
                ) : (
                  <Skeleton aria-label={t`Loading…`} className="h-5 w-48 rounded" />
                )
              ) : state === "TABLE_EXCLUDED" ? (
                <p>{t`The table was excluded from confirmation.`}</p>
              ) : state === "CONFIRMED" ? (
                <p>{t`You have a confirmed place at a table.`}</p>
              ) : state === "DUTY" ? (
                <>
                  <p>{t`You have an assigned role without a player seat.`}</p>
                  <ul>
                    {roles.map((role) => (
                      <li key={role}>{i18n._(recordUserRoleMessages[role])}</li>
                    ))}
                  </ul>
                </>
              ) : state === "OBSERVER" ? (
                <p>{t`You are not registered.`}</p>
              ) : summary ? (
                <EventCardTableSummaries tables={[summary]} mode="exclusions" showNames={false} />
              ) : (
                <Skeleton aria-label={t`Loading…`} className="h-5 w-48 rounded" />
              )}
              <dl className="space-y-1">
                {counts.map(({ label, value, Icon }) => (
                  <div key={label} className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="flex min-w-0 items-center gap-2">
                      <Icon aria-hidden className="size-4 shrink-0 text-muted" />
                      {label}
                    </dt>
                    <dd>
                      {value === undefined ? (
                        <Skeleton aria-label={t`Loading…`} className="h-4 w-6 rounded" />
                      ) : (
                        i18n.number(value)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {table.demonstratorGuestName || table.demonstratorUserId ? (
                <div className="flex flex-wrap items-center gap-1">
                  {t`Demonstrator`}:{" "}
                  {table.demonstratorGuestName ??
                    (table.demonstratorName === undefined ? (
                      <Skeleton
                        aria-label={t`Loading…`}
                        className="inline-block h-4 w-28 rounded"
                      />
                    ) : (
                      table.demonstratorName || t`Unknown`
                    ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </HelpPopover>
      {table.eventStatus !== "PLANNING" && table.confirmed ? (
        <>
          <EventTableSchedulePopover table={table} kind="locations" />
          <EventTableSchedulePopover table={table} kind="dates" />
          <EventTableGamesPopover games={tableCardGames(table)} name={table.name} />
        </>
      ) : null}
    </>
  );
}
