"use client";
import type { EventTableDraft } from "@board-game-organizer/shared";
import { Plural, useLingui } from "@lingui/react/macro";
import { Dices, Presentation, UsersRound } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { EventTableRatingBadge } from "./EventTableRatingBadge";

export function EventDraftTableCard({
  row,
  publicGroup = false,
}: {
  row: EventTableDraft;
  publicGroup?: boolean;
}) {
  const { t } = useLingui();
  const firstGame = row.games[0]?.name ?? t`Unknown`;
  const remaining = Math.max(0, row.games.length - 1);
  return (
    <ListCard>
      <div className="flex min-w-0 items-start gap-4 p-4">
        <AnimatedDicebearArtwork seed={row.id ?? row.key} variant="shapes" />
        <ListCardBody
          title={row.name}
          titleAccessory={<EventTableRatingBadge enabled={row.rankingEnabled} />}
        >
          <p className="flex items-center gap-2 text-sm">
            <Dices className="size-4 shrink-0 text-default-500" aria-hidden />
            <span className="min-w-0 truncate" title={firstGame}>
              {firstGame}
            </span>
            {remaining > 0 ? (
              <span className="shrink-0">
                <span aria-hidden>+{remaining}</span>
                <span className="sr-only">
                  <Plural
                    id="event.table.moreGames"
                    value={remaining}
                    one="+# game"
                    other="+# games"
                  />
                </span>
              </span>
            ) : null}
          </p>
          <p className="flex items-center gap-2 text-sm text-default-500">
            <UsersRound className="size-4 shrink-0" aria-hidden />
            <span>
              {t`Minimum players`}: {row.minPlayers} · {t`Maximum players`}: {row.maxPlayers}
            </span>
          </p>
          {publicGroup || row.demonstratorUserId ? (
            <p className="flex items-center gap-2 text-sm text-default-500">
              <Presentation className="size-4 shrink-0" aria-hidden />
              <span>
                {row.demonstratorUserId ? (row.demonstratorName ?? t`Unknown`) : t`No demonstrator`}
              </span>
            </p>
          ) : null}
        </ListCardBody>
      </div>
    </ListCard>
  );
}
