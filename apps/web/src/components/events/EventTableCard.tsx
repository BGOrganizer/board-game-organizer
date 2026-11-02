"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { tableParticipation, useNotificationAttentionContext } from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { Plural, useLingui } from "@lingui/react/macro";
import {
  CalendarDays,
  Clock3,
  Dices,
  ListOrdered,
  Presentation,
  Trophy,
  UserRoundCheck,
  UserRoundMinus,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { EventTableRatingBadge } from "./EventTableRatingBadge";
/** One Table item in both feeds; only the parent-context row varies. */
export function EventTableCard({
  table,
  context = "personal",
}: {
  table: PlannedTableResponse;
  context?: "personal" | "event";
}) {
  const { t, i18n } = useLingui(),
    number = new Intl.NumberFormat(i18n.locale);
  const indicator = tableParticipation(table.myRegistration, table.myPosition);
  const games = table.gamesDetail.filter(
      (game) =>
        table.eventStatus === "PLANNING" || !table.confirmed || game.id === table.confirmed.gameId,
    ),
    remaining = Math.max(0, games.length - 1);
  const attention = useNotificationAttentionContext(),
    attentionTarget = { kind: "table", id: table.id } as const;
  const counts = [
    {
      icon: UserRoundMinus,
      label: t`Minimum players`,
      value: table.minPlayers,
    },
    {
      icon: UserRoundPlus,
      label: t`Maximum players`,
      value: table.maxPlayers,
    },
    {
      icon: UserRoundCheck,
      label: t`Accepted players`,
      value: table.acceptedCount,
    },
    {
      icon: ListOrdered,
      label: t`Waiting list`,
      value: table.waitingCount,
    },
    {
      icon: Clock3,
      label: t`Pending players`,
      value: table.pendingRegistrationCount,
    },
  ];
  return (
    <LinkedListCard
      href={`/events/${table.eventId}/tables/${table.id}${context === "event" ? `?fromEvent=${encodeURIComponent(table.eventId)}` : ""}`}
      label={`${t`Open table`}: ${table.name}`}
      notificationCount={attention?.get(attentionTarget)?.count}
      leadingActions={indicator === null ? undefined : <ArtworkStatusPopover kind={indicator} />}
    >
      <AnimatedDicebearArtwork seed={table.id} variant="planets" />
      <ListCardBody
        title={table.name}
        titleIcon={<Dices className="size-4 shrink-0 text-muted" aria-hidden />}
        titleAccessory={<EventTableRatingBadge enabled={table.rankingEnabled} />}
      >
        <div className="space-y-2">
          {context === "personal" ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 break-words">{table.eventName}</span>
              </span>
              {table.groupId ? (
                <>
                  <span aria-hidden className="text-muted">
                    ·
                  </span>
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-muted">
                    <UsersRound className="size-4 shrink-0" aria-hidden />
                    {table.groupName ? (
                      <span className="min-w-0 break-words">{table.groupName}</span>
                    ) : (
                      <Skeleton className="h-4 w-28 rounded" />
                    )}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto text-sm tabular-nums">
            {counts.map(({ icon: Icon, label, value }) => (
              <span key={label} className="inline-flex shrink-0 items-center gap-1">
                <Icon className="size-4 text-muted" aria-hidden />
                <span className="sr-only">{label}: </span>
                {value === undefined ? (
                  <Skeleton aria-label={t`Loading…`} className="h-4 w-5 rounded" />
                ) : (
                  <span>{number.format(value)}</span>
                )}
              </span>
            ))}
          </div>
          <p className="flex items-start gap-2 text-sm">
            <Dices className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 break-words">
              {games[0]?.name ?? t`Unknown`}
              {remaining > 0 ? (
                <>
                  {" "}
                  ·{" "}
                  <Plural
                    id="event.table.moreGames"
                    value={remaining}
                    one="+# game"
                    other="+# games"
                  />
                </>
              ) : null}
            </span>
          </p>
          {table.demonstratorUserId ? (
            <p className="flex items-center gap-2 text-sm">
              <Presentation className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="sr-only">{t`Demonstrator`}: </span>
              {table.demonstratorName === undefined ? (
                <Skeleton className="h-4 w-28 rounded" />
              ) : (
                <span className="min-w-0 break-words">{table.demonstratorName || t`Unknown`}</span>
              )}
            </p>
          ) : null}
          {table.eventStatus !== "PLANNING" && !table.confirmed ? (
            <p className="text-sm text-warning">{t`Excluded from confirmation`}</p>
          ) : null}
          {table.eventStatus === "TERMINATED" && table.winners?.length ? (
            <p className="flex items-start gap-2 text-sm">
              <Trophy className="size-4 shrink-0 text-warning" aria-hidden />
              <span className="min-w-0 break-words">
                <span className="sr-only">{t`Winners`}: </span>
                {table.winners.map((row) => row.name).join(", ")}
              </span>
            </p>
          ) : null}
        </div>
      </ListCardBody>
    </LinkedListCard>
  );
}
