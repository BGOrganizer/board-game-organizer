"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useEventCutoff } from "@board-game-organizer/shared";
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
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { PendingArtworkBadge } from "@/components/common/ui/PendingArtworkBadge";
import { EventTableInvitationActions } from "./EventTableInvitationActions";
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
  const registration = table.myRegistration,
    pending = registration?.status === "PENDING",
    invited = registration?.kind === "INVITATION",
    waiting = table.myPosition === "WAITING";
  const accepted = registration?.status === "ACCEPTED" || table.myPosition === "FROZEN";
  const StatusIcon = waiting ? ListOrdered : UserRoundCheck;
  const games = table.gamesDetail.filter(
      (game) =>
        table.eventStatus === "PLANNING" || !table.confirmed || game.id === table.confirmed.gameId,
    ),
    remaining = Math.max(0, games.length - 1);
  const closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const canRespond =
    table.eventStatus === "PLANNING" && table.canRespond && !closed && pending && invited;
  const counts = [
    {
      icon: UserRoundMinus,
      label: t`Minimum players`,
      value: table.minPlayers,
      description: t`Minimum players`,
    },
    {
      icon: UserRoundPlus,
      label: t`Maximum players`,
      value: table.maxPlayers,
      description: t`Maximum players`,
    },
    {
      icon: UserRoundCheck,
      label: t`Accepted players`,
      value: table.acceptedCount,
      description: t`Accepted players, including the waiting list.`,
    },
    {
      icon: ListOrdered,
      label: t`Waiting list`,
      value: table.waitingCount,
      description: t`Waiting list`,
    },
    {
      icon: Clock3,
      label: t`Pending players`,
      value: table.pendingRegistrationCount,
      description: t`Pending players, including reserved waiting-list places.`,
    },
  ];
  return (
    <LinkedListCard
      href={`/events/${table.eventId}/tables/${table.id}${context === "event" ? `?fromEvent=${encodeURIComponent(table.eventId)}` : ""}`}
      label={`${t`Open table`}: ${table.name}`}
      leadingActions={
        <HelpPopover label={`${t`Players`}: ${t`Field help`}`} title={t`Players`}>
          <IconLegend items={counts.map(({ icon, description }) => ({ icon, description }))} />
        </HelpPopover>
      }
      actions={
        canRespond && registration ? (
          <EventTableInvitationActions eventId={table.eventId} registration={registration} />
        ) : undefined
      }
    >
      <span className="relative size-16 shrink-0">
        <AnimatedDicebearArtwork seed={table.id} variant="planets" />
        {pending ? (
          <PendingArtworkBadge
            kind={invited ? "invitation" : "request"}
            label={invited ? t`Invitation received` : t`Participation requested`}
          />
        ) : waiting || accepted ? (
          <span
            role="img"
            aria-label={waiting ? t`Waiting list` : t`Confirmed player`}
            className={`absolute bottom-0 right-0 rounded-tl-lg bg-surface p-1 ${waiting ? "text-warning" : "text-success"}`}
          >
            <StatusIcon className="size-4" aria-hidden />
          </span>
        ) : null}
      </span>
      <ListCardBody
        title={table.name}
        titleIcon={<Dices className="size-4 shrink-0 text-default-500" aria-hidden />}
        titleAccessory={<EventTableRatingBadge enabled={table.rankingEnabled} />}
      >
        <div className="space-y-2 pb-12">
          {context === "personal" ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                <CalendarDays className="size-4 shrink-0 text-default-500" aria-hidden />
                <span className="min-w-0 break-words">{table.eventName}</span>
              </span>
              {table.groupId ? (
                <>
                  <span aria-hidden className="text-default-500">
                    ·
                  </span>
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-default-500">
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
                <Icon className="size-4 text-default-500" aria-hidden />
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
            <Dices className="size-4 shrink-0 text-default-500" aria-hidden />
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
              <Presentation className="size-4 shrink-0 text-default-500" aria-hidden />
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
