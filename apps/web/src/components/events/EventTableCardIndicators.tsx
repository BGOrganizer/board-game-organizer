"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  canManageEvent,
  tableCardGames,
  tableParticipation,
  tablePendingAction,
  useEventCutoff,
} from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarCheck, CircleOff, Clock3, Flag, Trophy } from "lucide-react";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableGamesPopover } from "./EventTableGamesPopover";
import { EventTableSchedulePopover } from "./EventTableSchedulePopover";

/** Capabilities, duty and participation are independent facts, never mutually exclusive roles. */
export function EventTableCardIndicators({
  table,
  variant = "list",
}: {
  table: PlannedTableResponse;
  variant?: "list" | "identity";
}) {
  const { t, i18n } = useLingui();
  const { userId } = useCommunityApi();
  const manager = canManageEvent(table, userId);
  const participation = tableParticipation(table.myRegistration, table.myPosition);
  const closed = useEventCutoff(
    table.bookingClosesAt,
    table.groupType === "PUBLIC" && table.eventStatus === "PLANNING",
  );
  const planning = table.eventStatus === "PLANNING";
  const confirmed = table.eventStatus === "CONFIRMED";
  const status = planning ? t`Planning` : confirmed ? t`Confirmed` : t`Terminated`;
  const counts = [
    { label: t`Minimum players`, value: table.minPlayers },
    { label: t`Maximum players`, value: table.maxPlayers },
    { label: t`Accepted players`, value: table.acceptedCount },
    { label: t`Waiting list`, value: table.waitingCount },
    { label: t`Unconfirmed players`, value: table.pendingRegistrationCount },
  ];
  return (
    <>
      {manager ? (
        <ArtworkStatusPopover
          size="compact"
          kind={table.managementRole === "admin" ? "admin" : "manager"}
          label={table.managementRole === "moderator" ? t`Group moderator` : undefined}
        />
      ) : null}
      {table.demonstratorUserId && table.demonstratorUserId === userId ? (
        <ArtworkStatusPopover size="compact" kind="demonstrator" />
      ) : null}
      {table.myRegistration?.status === "ACCEPTED" && participation !== "confirmed" ? (
        <ArtworkStatusPopover size="compact" kind="accepted" />
      ) : null}
      {participation !== null ? (
        <ArtworkStatusPopover
          size="compact"
          kind={participation}
          action={closed ? null : tablePendingAction(table)}
        />
      ) : null}
      {table.myPosition === "WAITING" &&
      (participation === "request" || participation === "invitation") ? (
        <ArtworkStatusPopover size="compact" kind="waiting" />
      ) : null}
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={planning ? Clock3 : confirmed ? CalendarCheck : Flag}
        tone={planning ? "warning" : confirmed ? "success" : "muted"}
        triggerClassName="bg-default"
        className="w-[min(24rem,calc(100vw-2rem))]"
      >
        <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
          <p>
            {planning
              ? t`The table is being planned. Dates, locations and games are still proposals.`
              : confirmed
                ? t`The table has been confirmed. Only the chosen date, location and game are shown.`
                : t`The table has finished. Results are immutable.`}
          </p>
          {!planning && !table.confirmed ? (
            <p className="mt-2 text-warning">{t`Excluded from confirmation`}</p>
          ) : null}
          <p className="mt-2">{t`The minimum is required for agreement. The maximum limits reserved places; additional players remain in the waiting queue.`}</p>
          <dl className="mt-2 space-y-1">
            {counts.map(({ label, value }) => (
              <div key={label} className="flex flex-wrap items-center justify-between gap-2">
                <dt>{label}</dt>
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
          {table.demonstratorUserId ? (
            <p className="mt-2 break-words">
              {t`Demonstrator`}:{" "}
              {table.demonstratorName === undefined ? (
                <Skeleton className="inline-block h-4 w-28 rounded" />
              ) : (
                table.demonstratorName || t`Unknown`
              )}
            </p>
          ) : null}
          {table.eventStatus === "TERMINATED" && table.winners?.length ? (
            <p className="mt-2 break-words">
              {t`Winners`}: {table.winners.map((row) => row.name).join(", ")}
            </p>
          ) : null}
        </div>
      </HelpPopover>
      <HelpPopover
        size="compact"
        label={table.rankingEnabled ? t`Rating enabled` : t`Rating disabled`}
        title={t`Rating`}
        icon={table.rankingEnabled ? Trophy : CircleOff}
        tone={table.rankingEnabled ? "accent" : "muted"}
        triggerClassName="bg-default"
      >
        <p>
          {table.rankingEnabled
            ? t`This table contributes to player ratings when eligible results are finalized.`
            : t`This table does not update player ratings.`}
        </p>
      </HelpPopover>
      {variant === "list" ? (
        <>
          <EventTableSchedulePopover table={table} kind="dates" />
          <EventTableSchedulePopover table={table} kind="locations" />
          <EventTableGamesPopover games={tableCardGames(table)} name={table.name} />
        </>
      ) : null}
    </>
  );
}
