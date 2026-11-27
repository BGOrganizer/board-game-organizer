"use client";

import type { BggSearchItem, PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  eventTablePeople,
  formatUsername,
  type tablePlayerRatingRows,
} from "@board-game-organizer/shared";
import { Avatar, Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Dices, Trophy } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { EventFinalResultRow } from "./EventFinalResultRow";

type FinalTable = Parameters<typeof eventTablePeople>[0] &
  Parameters<typeof tablePlayerRatingRows>[0] &
  Pick<PlannedTableResponse, "gamesDetail">;

export function EventFinalResults({
  table,
  renderGameMetadata,
}: {
  table: FinalTable;
  renderGameMetadata: (game: BggSearchItem) => ReactNode;
}) {
  const { t } = useLingui();
  const rows = useMemo(() => eventTablePeople(table, []), [table]);
  const [count, setCount] = useState(8);
  if (!table.confirmed && !table.results) return <p>{t`Excluded from confirmation`}</p>;

  const game = table.gamesDetail.find((game) => game.id === table.confirmed?.gameId);

  return (
    <section aria-label={t`Results`} className="space-y-3">
      {game ? (
        <SectionHeaderCard
          title={game.name}
          leading={
            <div className="relative shrink-0">
              <Avatar size="md" className="rounded-xl">
                <Avatar.Image src={game.imageUrl ?? undefined} alt="" />
                <Avatar.Fallback>
                  <Dices aria-hidden className="size-4" />
                </Avatar.Fallback>
              </Avatar>
              <div className="absolute -right-2.5 -bottom-2.5 z-10">{renderGameMetadata(game)}</div>
            </div>
          }
        />
      ) : null}
      {rows.length ? (
        <ol className="space-y-2">
          {rows.slice(0, count).map((player) => (
            <EventFinalResultRow
              key={player.key}
              table={table}
              player={player}
              name={formatUsername(
                player.username,
                player.profileLoaded && player.name ? player.name : t`Username unavailable`,
              )}
            />
          ))}
        </ol>
      ) : (
        <EmptyList icon={<Trophy className="size-7" />}>{t`No players found`}</EmptyList>
      )}
      {count < rows.length ? (
        <Button variant="secondary" onPress={() => setCount((previous) => previous + 8)}>
          {t`Load more`}
        </Button>
      ) : null}
    </section>
  );
}
