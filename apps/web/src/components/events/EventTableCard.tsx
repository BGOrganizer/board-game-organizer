"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useEventCutoff } from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { Plural, useLingui } from "@lingui/react/macro";
import {
  CalendarDays,
  Clock3,
  Dices,
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
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableInvitationActions } from "./EventTableInvitationActions";

export function EventTableCard({ table }: { table: PlannedTableResponse }) {
  const { t, i18n } = useLingui();
  const number = new Intl.NumberFormat(i18n.locale);
  const registration = table.myRegistration,
    actor = useCommunityApi().userId;
  const winner =
    table.eventStatus === "TERMINATED" && table.winners?.some((row) => row.userId === actor);
  const accepted =
      registration?.status === "ACCEPTED" ||
      table.myPosition === "FROZEN" ||
      table.myPosition === "WAITING",
    waiting = table.myPosition === "WAITING";
  const StatusIcon = winner ? Trophy : waiting ? Clock3 : UserRoundCheck;
  const games = table.gamesDetail.filter(
      (game) =>
        table.eventStatus === "PLANNING" || !table.confirmed || game.id === table.confirmed.gameId,
    ),
    remaining = Math.max(0, games.length - 1);
  const closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const pending = registration?.status === "PENDING";
  const invited = registration?.kind === "INVITATION";
  const canRespond =
    table.eventStatus === "PLANNING" && table.canRespond && !closed && pending && invited;
  const counts = [
    { icon: UserRoundMinus, label: t`Minimum players`, value: table.minPlayers },
    { icon: UserRoundPlus, label: t`Maximum players`, value: table.maxPlayers },
    { icon: UserRoundCheck, label: t`Accepted players`, value: table.acceptedCount },
    { icon: Clock3, label: t`Pending players`, value: table.pendingRegistrationCount },
  ];
  return (
    <LinkedListCard
      href={`/events/${table.eventId}/tables/${table.id}`}
      label={`${t`Open table`}: ${table.name}`}
      actions={
        <>
          <HelpPopover label={`${t`Players`}: ${t`Field help`}`} title={t`Players`}>
            <IconLegend items={counts.map(({ icon, label }) => ({ icon, description: label }))} />
          </HelpPopover>
          {canRespond && registration ? (
            <EventTableInvitationActions eventId={table.eventId} registration={registration} />
          ) : null}
        </>
      }
    >
      <span className="relative size-16 shrink-0">
        <AnimatedDicebearArtwork seed={table.id} variant="shapes" />
        {winner || (!pending && accepted) ? (
          <span
            role="img"
            aria-label={winner ? t`Winner` : waiting ? t`Waiting list` : t`Confirmed player`}
            className={`absolute bottom-0 right-0 rounded-tl-lg bg-surface p-1 ${winner || waiting ? "text-warning" : "text-success"}`}
          >
            <StatusIcon className="size-4" aria-hidden />
          </span>
        ) : pending ? (
          <PendingArtworkBadge
            kind={invited ? "invitation" : "request"}
            label={invited ? t`Invitation received` : t`Participation requested`}
          />
        ) : null}
      </span>
      <ListCardBody
        title={table.name}
        titleIcon={<Dices className="size-4 shrink-0 text-default-500" aria-hidden />}
      >
        <div className="space-y-2 pb-12">
          <div className="flex items-start gap-2 text-sm">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-default-500" aria-hidden />
            <span className="min-w-0 flex-1 break-words">{table.eventName}</span>
          </div>
          {table.groupId ? (
            <div className="flex items-center gap-2 text-sm text-default-500">
              <UsersRound className="size-4 shrink-0" aria-hidden />
              {table.groupName ? (
                <span className="min-w-0 break-words">{table.groupName}</span>
              ) : (
                <Skeleton className="h-4 w-28 rounded" />
              )}
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
          {table.eventStatus !== "PLANNING" && !table.confirmed ? (
            <p className="text-sm text-warning">{t`Excluded from confirmation`}</p>
          ) : null}
          {table.winners?.length ? (
            <p className="text-sm">
              {t`Winners`}: {table.winners.map((row) => row.name).join(", ")}
            </p>
          ) : null}
        </div>
      </ListCardBody>
    </LinkedListCard>
  );
}
