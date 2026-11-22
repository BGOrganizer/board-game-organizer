"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  type EventTablePerson,
  eventTablePeople,
  formatUsername,
  useTableLeaderboard,
} from "@board-game-organizer/shared";
import { Avatar, Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Dices, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventFinalResultRow } from "./EventFinalResultRow";
import { EventPlayerRatingPopover } from "./EventPlayerRatingPopover";

export function EventTableResults({ table }: { table: PlannedTableResponse }) {
  const { t } = useLingui(),
    o = useCommunityApi();
  const terminated = table.eventStatus === "TERMINATED";
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
  const history = useMemo(
    () => (terminated ? eventTablePeople(table, []) : []),
    [table, terminated],
  );
  const rows: EventTablePerson[] =
    communityAccessDenied(q.error) && !terminated
      ? []
      : terminated
        ? history
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
  const more = count < rows.length || (!terminated && q.hasMore);
  if (!table.confirmed && (!terminated || !table.results))
    return <p>{t`Excluded from confirmation`}</p>;
  const game = terminated
    ? table.gamesDetail.find((game) => game.id === table.confirmed?.gameId)
    : undefined;
  const visibleRows = rows.slice(0, count).map((row) => {
    const name = formatUsername(
      row.username,
      row.profileLoaded && row.name ? row.name : t`Username unavailable`,
    );
    if (terminated) {
      return <EventFinalResultRow key={row.key} table={table} player={row} name={name} />;
    }
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
      {game && (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar size="md" className="shrink-0 rounded-xl">
            <Avatar.Image src={game.imageUrl ?? undefined} alt="" />
            <Avatar.Fallback>
              <Dices aria-hidden className="size-4" />
            </Avatar.Fallback>
          </Avatar>
          <span className="min-w-0 break-words font-medium">{game.name}</span>
        </div>
      )}
      {terminated ? (
        visibleRows.length > 0 && (
          <ol key={key} className="space-y-2">
            {visibleRows}
          </ol>
        )
      ) : (
        <GroupedList>{visibleRows}</GroupedList>
      )}
      {!terminated && (q.isPending || q.isFetchingNextPage || (!rows.length && q.isFetching)) ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : null}
      {!terminated && q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load leaderboards. Retry`}</p>
          <Button
            onPress={() =>
              void (q.isFetchNextPageError ? q.fetchNextPage({ cancelRefetch: false }) : q.retry())
            }
          >{t`Try again`}</Button>
        </div>
      ) : null}
      {(terminated || (!q.isPending && !q.isError && !q.isFetching)) && !rows.length ? (
        <EmptyList icon={<Trophy className="size-7" />}>{t`No players found`}</EmptyList>
      ) : null}
      {more ? (
        <Button
          variant="secondary"
          isDisabled={
            !terminated && !q.cachedMore && count >= rows.length && (q.isFetching || q.isError)
          }
          onPress={() => {
            if (!terminated && count >= rows.length) q.loadMore();
            setWindow((old) => (old.key === key ? { key, count: old.count + 8 } : old));
          }}
        >{t`Load more`}</Button>
      ) : null}
    </section>
  );
}
