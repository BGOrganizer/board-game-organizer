"use client";

import type { BggSearchItem } from "@board-game-organizer/schemas";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChevronLeft, ChevronRight, Dices } from "lucide-react";
import { useState } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { GameListRow } from "@/components/games/GameListRow";

/** Local presentation pages only: opening this popover never fetches or votes. */
export function EventTableGamesPopover({
  games,
  name,
}: {
  games: readonly BggSearchItem[];
  name: string;
}) {
  const { t } = useLingui();
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(games.length / 8) - 1));
  return (
    <HelpPopover
      label={`${t`Board games`}: ${name}`}
      title={t`Board games`}
      icon={Dices}
      triggerClassName="bg-default"
      className="w-[min(24rem,calc(100vw-2rem))]"
    >
      <div className="max-h-[50vh] overflow-y-auto overscroll-contain">
        <GroupedList>
          {games.slice(page * 8, (page + 1) * 8).map((game) => (
            <GameListRow
              key={game.id}
              name={game.name}
              imageUrl={game.imageUrl}
              year={game.year}
              average={game.average}
              rank={game.rank}
            />
          ))}
        </GroupedList>
        {!games.length ? <p className="text-muted">{t`No games found`}</p> : null}
      </div>
      {games.length > 8 ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            aria-label={t`Previous page`}
            aria-disabled={page === 0}
            onPress={() => setPage(Math.max(0, page - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="text-sm tabular-nums">
            {page + 1} / {Math.ceil(games.length / 8)}
          </span>
          {/* Keep focus at the last page so Escape still closes the popover. */}
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            aria-label={t`Next page`}
            aria-disabled={(page + 1) * 8 >= games.length}
            onPress={() => setPage(Math.min(Math.ceil(games.length / 8) - 1, page + 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
    </HelpPopover>
  );
}
