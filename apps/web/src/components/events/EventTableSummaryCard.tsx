"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useEventCutoff } from "@board-game-organizer/shared";
import { Plural, useLingui } from "@lingui/react/macro";
import { Clock3, Dices, Mail, UserRoundCheck, UsersRound } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { EventTableInvitationActions } from "./EventTableInvitationActions";
import { EventTableRatingBadge } from "./EventTableRatingBadge";
/** Whole-card navigation; interactive help/consent remains outside the link. */
export function EventTableSummaryCard({ table }: { table: PlannedTableResponse }) {
  const { t, i18n } = useLingui(),
    number = new Intl.NumberFormat(i18n.locale);
  const closed = useEventCutoff(table.bookingClosesAt, table.groupType === "PUBLIC");
  const games = table.gamesDetail.filter(
    (game) =>
      table.eventStatus === "PLANNING" || !table.confirmed || game.id === table.confirmed.gameId,
  );
  const remaining = Math.max(0, games.length - 1);
  const counts = [
    {
      icon: UserRoundCheck,
      label: t`Seated accepted players / minimum required`,
      value: `${number.format(table.seatedCount)}/${number.format(table.minPlayers)}`,
    },
    { icon: UsersRound, label: t`Maximum players`, value: number.format(table.maxPlayers) },
    { icon: Clock3, label: t`Waiting`, value: number.format(table.waitingCount) },
    { icon: Mail, label: t`Pending invitations`, value: number.format(table.pendingCount) },
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
          {table.canRespond && !closed && table.myRegistration ? (
            <EventTableInvitationActions
              eventId={table.eventId}
              registration={table.myRegistration}
            />
          ) : null}
        </>
      }
    >
      <AnimatedDicebearArtwork seed={table.id} variant="shapes" />
      <div className="min-w-0 flex-1 space-y-2 pb-12">
        <div className="flex items-center gap-2">
          <Dices className="size-4 shrink-0 text-default-500" aria-hidden />
          <p className="min-w-0 flex-1 break-words font-semibold text-foreground">{table.name}</p>
          <EventTableRatingBadge enabled={table.rankingEnabled} />
        </div>
        <div className="flex flex-nowrap items-center gap-3 overflow-x-auto text-sm tabular-nums">
          {counts.map(({ icon: Icon, label, value }) => (
            <span key={label} className="inline-flex shrink-0 items-center gap-1">
              <Icon className="size-4 text-default-500" aria-hidden />
              <span className="sr-only">{label}: </span>
              <span>{value}</span>
            </span>
          ))}
        </div>
        <p className="flex items-start gap-2">
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
        {table.myPosition === "WAITING" || table.myPosition === "FROZEN" ? (
          <p className="text-sm">
            {table.myPosition === "WAITING" ? t`Waiting list` : t`Confirmed player`}
          </p>
        ) : null}
        {table.canRespond && !closed && table.myRegistration ? (
          <p className="text-sm">{t`Invitation received`}</p>
        ) : null}
      </div>
    </LinkedListCard>
  );
}
