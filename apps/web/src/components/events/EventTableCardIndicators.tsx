"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  tableCardGames,
  tableParticipation,
  tablePendingAction,
  useEventCutoff,
} from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  CalendarCheck,
  CircleOff,
  Clock3,
  Flag,
  ListOrdered,
  Mail,
  Presentation,
  Trophy,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableGamesPopover } from "./EventTableGamesPopover";
import { EventTableSchedulePopover } from "./EventTableSchedulePopover";

/** Capabilities, duty and participation are independent facts, never mutually exclusive roles. */
export function EventTableCardIndicators({ table }: { table: PlannedTableResponse }) {
  const { t, i18n } = useLingui();
  const { userId } = useCommunityApi();
  const participation = tableParticipation(table.myRegistration, table.myPosition);
  const closed = useEventCutoff(
    table.bookingClosesAt,
    table.groupType === "PUBLIC" && table.eventStatus === "PLANNING",
  );
  const planning = table.eventStatus === "PLANNING";
  const confirmed = table.eventStatus === "CONFIRMED";
  const status = planning ? t`Planning` : confirmed ? t`Confirmed` : t`Terminated`;
  const counts = [
    { label: t`Minimum players`, value: table.minPlayers, Icon: UsersRound },
    { label: t`Maximum players`, value: table.maxPlayers, Icon: UsersRound },
    { label: t`Accepted players`, value: table.acceptedCount, Icon: UserRoundCheck },
    { label: t`Waiting list`, value: table.waitingCount, Icon: ListOrdered },
    { label: t`Unconfirmed players`, value: table.pendingRegistrationCount, Icon: Mail },
  ];
  return (
    <>
      {table.demonstratorUserId && table.demonstratorUserId === userId ? (
        <ArtworkStatusPopover size="compact" kind="demonstrator" />
      ) : null}
      {participation !== null && participation !== "request" ? (
        <ArtworkStatusPopover
          size="compact"
          kind={participation}
          label={
            participation === "confirmed"
              ? t`Confirmed player`
              : participation === "waiting"
                ? t`Player on the waiting list`
                : participation === "invitation"
                  ? t`Player with pending invitation`
                  : undefined
          }
          action={closed ? null : tablePendingAction(table)}
        />
      ) : null}
      {table.myPosition === "WAITING" &&
      (participation === "request" || participation === "invitation") ? (
        <ArtworkStatusPopover size="compact" kind="waiting" label={t`Player on the waiting list`} />
      ) : null}
      <HelpPopover
        size="compact"
        label={status}
        title={status}
        icon={planning ? Clock3 : confirmed ? CalendarCheck : Flag}
        tone={planning ? "warning" : confirmed ? "success" : "muted"}
        triggerClassName="bg-default"
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
          <dl className="mt-2 space-y-1">
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
          {table.demonstratorUserId ? (
            <p className="mt-2 break-words">
              <Presentation aria-hidden className="mr-2 inline size-4 text-accent" />
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
              <Trophy aria-hidden className="mr-2 inline size-4 text-success" />
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
      <EventTableSchedulePopover table={table} kind="dates" />
      <EventTableSchedulePopover table={table} kind="locations" />
      <EventTableGamesPopover games={tableCardGames(table)} name={table.name} />
    </>
  );
}
