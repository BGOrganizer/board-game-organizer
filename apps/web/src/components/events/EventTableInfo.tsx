"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react/macro";
import { Dices, Settings2, UserRoundCheck, UsersRound } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { EventTableRatingBadge } from "./EventTableRatingBadge";

export function EventTableInfo({ table }: { table: PlannedTableResponse }) {
  const { t, i18n } = useLingui();
  const number = new Intl.NumberFormat(i18n.locale);
  return (
    <section aria-label={t`Settings`} className="space-y-2">
      <div className="flex items-center gap-1">
        <Settings2 className="size-5 text-default-500" aria-hidden />
        <SearchHelpLabel
          label={t`Settings`}
          helpTitle={t`Field help`}
          help={t`The minimum is required for agreement. The maximum limits reserved places; additional players remain in the waiting queue.`}
        />
      </div>
      <ListCard>
        <div className="flex min-w-0 items-start gap-4 p-4">
          <AnimatedDicebearArtwork seed={table.id} variant="planets" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start gap-2">
              <Dices className="mt-0.5 size-4 shrink-0 text-default-500" aria-hidden />
              <h1 className="min-w-0 flex-1 break-words text-base font-semibold">{table.name}</h1>
              <EventTableRatingBadge enabled={table.rankingEnabled} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1">
                <UserRoundCheck className="size-4 text-default-500" aria-hidden />
                {t`Minimum players`}: {number.format(table.minPlayers)}
              </span>
              <span className="inline-flex items-center gap-1">
                <UsersRound className="size-4 text-default-500" aria-hidden />
                {t`Maximum players`}: {number.format(table.maxPlayers)}
              </span>
            </div>
          </div>
        </div>
      </ListCard>
      {table.eventStatus !== "PLANNING" && !table.confirmed ? (
        <p className="text-sm text-warning">{t`Excluded from confirmation`}</p>
      ) : null}
    </section>
  );
}
