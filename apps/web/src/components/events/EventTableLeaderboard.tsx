"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { communityAccessDenied, useTableLeaderboard } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Clock3 } from "lucide-react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GameListRow } from "@/components/games/GameListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventPlayerCard } from "./EventPlayerCard";
export function EventTableLeaderboard({ table }: { table: PlannedTableResponse }) {
  const { t, i18n } = useLingui(),
    q = useTableLeaderboard(useCommunityApi(), table.eventId, table.id, table.confirmed?.gameId);
  const number = new Intl.NumberFormat(i18n.locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  const rows = communityAccessDenied(q.error) ? [] : q.items,
    game = table.gamesDetail.find((value) => value.id === table.confirmed?.gameId);
  if (!table.confirmed) return <p>{t`Excluded from confirmation`}</p>;
  return (
    <section className="space-y-4" aria-label={t`Table leaderboard`}>
      <h2 className="font-semibold">{t`Selected game`}</h2>
      <GroupedList>
        <GameListRow
          name={game?.name ?? t`Unknown`}
          imageUrl={game?.imageUrl}
          year={game?.year}
          average={game?.average}
          rank={game?.rank}
        />
      </GroupedList>
      <h2 className="font-semibold">{t`Ranking`}</h2>
      <p className="text-sm text-default-500">
        {table.groupId ? t`Group rating` : t`Global rating`}
      </p>
      {q.isPending ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {rows.map((row) => (
        <EventPlayerCard
          key={row.userId}
          name={row.name}
          username={row.username}
          avatarUrl={row.avatarUrl}
        >
          <div>
            <p className="text-xs text-default-500">{t`Games played`}</p>
            <p>{row.gamesPlayed}</p>
          </div>
          <div>
            <p className="text-xs text-default-500">{t`Games won`}</p>
            <p>{row.gamesWon}</p>
          </div>
          <div>
            <p className="text-xs text-default-500">{t`ND`}</p>
            <p>{row.nd}</p>
          </div>
          <div>
            <p className="text-xs text-default-500">{t`Ranking`}</p>
            <p className="inline-flex items-center gap-1">
              {number.format(row.score)}
              {row.provisional ? (
                <span role="img" aria-label={t`Provisional rating`}>
                  <Clock3 className="size-4 text-warning" aria-hidden />
                </span>
              ) : null}
            </p>
          </div>
        </EventPlayerCard>
      ))}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load leaderboards. Retry`}</p>
          <Button
            onPress={() =>
              void (q.isFetchNextPageError ? q.fetchNextPage({ cancelRefetch: false }) : q.retry())
            }
          >{t`Try again`}</Button>
        </div>
      ) : null}
      {!q.isPending && !q.isError && !rows.length ? <p>{t`No players found`}</p> : null}
      {q.isFetchingNextPage ? <Skeleton className="h-12 w-full rounded-lg" /> : null}
      {q.hasNextPage ? (
        <Button
          isDisabled={q.isFetchingNextPage}
          onPress={() => void q.fetchNextPage({ cancelRefetch: false })}
        >{t`Load more`}</Button>
      ) : null}
    </section>
  );
}
