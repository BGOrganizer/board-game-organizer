"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  type EventTablePerson,
  formatUsername,
  useTableLeaderboard,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Trophy } from "lucide-react";
import { useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { GameCatalogMetadata } from "@/components/games/GameCatalogMetadata";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventFinalResults } from "./EventFinalResults";
import { EventPlayerRatingPopover } from "./EventPlayerRatingPopover";

export function EventTableResults({ table }: { table: PlannedTableResponse }) {
  const o = useCommunityApi();
  if (table.eventStatus === "TERMINATED") {
    return (
      <EventFinalResults
        key={JSON.stringify([
          o.apiUrl,
          o.userId,
          table.id,
          table.confirmed?.gameId,
          table.confirmed?.playerIds,
          table.results?.finalizedAt,
        ])}
        table={table}
        renderGameMetadata={(game) => <GameCatalogMetadata game={game} name={game.name} visible />}
      />
    );
  }
  return <CurrentTableResults table={table} options={o} />;
}

function CurrentTableResults({
  table,
  options: o,
}: {
  table: PlannedTableResponse;
  options: ReturnType<typeof useCommunityApi>;
}) {
  const { t } = useLingui();
  const q = useTableLeaderboard(
    {
      ...o,
      enabled: table.eventStatus === "CONFIRMED" && !table.sharedResultsOnly && o.enabled !== false,
    },
    table.eventId,
    table.id,
    table.confirmed?.gameId,
    table.confirmed?.playerIds.filter(
      (id) => !table.confirmed?.guestPlayers?.some((guest) => guest.participantId === id),
    ),
  );
  const rows: EventTablePerson[] = communityAccessDenied(q.error)
    ? []
    : q.items
        .filter((row) => table.confirmed?.playerIds.includes(row.userId))
        .map((row) => ({
          ...row,
          key: row.userId,
          email: null,
          profileLoaded: true,
          rank: undefined,
          score: undefined,
        }));
  const key = JSON.stringify([
    o.apiUrl,
    o.userId,
    table.id,
    table.eventStatus,
    table.confirmed?.gameId,
    table.confirmed?.playerIds,
    table.results?.finalizedAt,
  ]);
  const [window, setWindow] = useState({ key, count: 8 });
  if (window.key !== key) setWindow({ key, count: 8 });
  const count = window.key === key ? window.count : 8;
  const more = count < rows.length || q.hasMore;
  if (!table.confirmed) return <p>{t`Excluded from confirmation`}</p>;
  const visibleRows = rows.slice(0, count).map((row) => {
    const name = formatUsername(
      row.username,
      row.profileLoaded && row.name ? row.name : t`Username unavailable`,
    );
    return (
      <UserListRow
        key={row.key}
        name={name}
        avatarUrl={row.avatarUrl}
        avatarContent={row.guestName ? <GuestAvatar name={row.guestName} /> : undefined}
      >
        {row.guestName ? null : (
          <EventPlayerRatingPopover
            table={table}
            userId={row.userId}
            name={name}
            current={q.items.find((item) => item.userId === row.userId)}
          />
        )}
      </UserListRow>
    );
  });
  return (
    <section aria-label={t`Results`} className="space-y-3">
      <GroupedList>{visibleRows}</GroupedList>
      {q.isPending || q.isFetchingNextPage || (!rows.length && q.isFetching) ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : null}
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
      {!q.isPending && !q.isError && !q.isFetching && !rows.length ? (
        <EmptyList icon={<Trophy className="size-7" />}>{t`No players found`}</EmptyList>
      ) : null}
      {more ? (
        <Button
          variant="secondary"
          isDisabled={!q.cachedMore && count >= rows.length && (q.isFetching || q.isError)}
          onPress={() => {
            if (count >= rows.length) q.loadMore();
            setWindow((old) => (old.key === key ? { key, count: old.count + 8 } : old));
          }}
        >{t`Load more`}</Button>
      ) : null}
    </section>
  );
}
