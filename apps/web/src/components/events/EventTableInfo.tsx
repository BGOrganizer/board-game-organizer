"use client";

import { notificationItemId, type PlannedTableResponse } from "@board-game-organizer/schemas";
import { canManageEvent, tableParticipation } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { Dices, Settings2, UserRoundCheck, UsersRound } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { ListCard } from "@/components/common/ui/ListCard";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableRatingBadge } from "./EventTableRatingBadge";

export function EventTableInfo({ table }: { table: PlannedTableResponse }) {
  const { t, i18n } = useLingui();
  const { userId } = useCommunityApi();
  const number = new Intl.NumberFormat(i18n.locale);
  const manager = canManageEvent(table, userId);
  const participation = tableParticipation(table.myRegistration, table.myPosition);
  return (
    <section aria-label={t`Settings`}>
      <ListCard
        background={
          <AnimatedDicebearArtwork seed={table.id} variant="planets" presentation="background" />
        }
      >
        <div className="flex items-center gap-1 text-sm">
          <Settings2 className="size-4 text-muted" aria-hidden />
          <SearchHelpLabel
            label={t`Settings`}
            helpTitle={t`Field help`}
            help={t`The minimum is required for agreement. The maximum limits reserved places; additional players remain in the waiting queue.`}
          />
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Dices className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
          <h1 className="min-w-0 flex-1 break-words text-lg font-semibold">{table.name}</h1>
          <NotificationItem
            itemId={notificationItemId(table.id, "overview", undefined, "table")}
            readOnly
          />
          <EventTableRatingBadge enabled={table.rankingEnabled} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1">
            <UserRoundCheck className="size-4 text-muted" aria-hidden />
            {t`Minimum players`}: {number.format(table.minPlayers)}
          </span>
          <span className="inline-flex items-center gap-1">
            <UsersRound className="size-4 text-muted" aria-hidden />
            {t`Maximum players`}: {number.format(table.maxPlayers)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {manager ? <ArtworkStatusPopover kind="manager" /> : null}
          {participation !== null ? (
            <ArtworkStatusPopover kind={participation} />
          ) : !manager ? (
            <ArtworkStatusPopover kind="viewer" />
          ) : null}
          {table.demonstratorUserId && table.demonstratorUserId === userId ? (
            <ArtworkStatusPopover kind="demonstrator" />
          ) : null}
        </div>
        {table.eventStatus !== "PLANNING" && !table.confirmed ? (
          <p className="text-sm text-warning">{t`Excluded from confirmation`}</p>
        ) : null}
      </ListCard>
    </section>
  );
}
