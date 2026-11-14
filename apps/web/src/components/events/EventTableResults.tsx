"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  type EventTablePerson,
  eventTablePeople,
  formatUsername,
  useTableLeaderboard,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ListOrdered, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { useCommunityApi } from "@/lib/useCommunityApi";
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
    table.confirmed?.playerIds,
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
  return (
    <section aria-label={t`Results`} className="space-y-3">
      <GroupedList>
        {rows.slice(0, count).map((row) => {
          const name = formatUsername(
            row.username,
            row.profileLoaded && row.name ? row.name : t`Username unavailable`,
          );
          return (
            <GroupedRow key={row.key}>
              <UserIdentity
                name={name}
                avatarUrl={row.avatarUrl}
                secondary={
                  terminated
                    ? `${t`Position`}: ${row.rank === null || row.rank === undefined ? t`ND` : `#${row.rank}`}`
                    : undefined
                }
                badge={
                  terminated ? (
                    <IconBadge
                      icon={row.rank === 1 ? Trophy : ListOrdered}
                      color={row.rank === 1 ? "success" : "default"}
                      label={`${t`Position`}: ${row.rank === null || row.rank === undefined ? t`ND` : `#${row.rank}`}`}
                      title={t`Position`}
                    >
                      <p>{row.rank === null || row.rank === undefined ? t`ND` : `#${row.rank}`}</p>
                    </IconBadge>
                  ) : undefined
                }
              >
                <EventPlayerRatingPopover
                  table={table}
                  userId={row.userId}
                  name={name}
                  current={
                    !terminated ? q.items.find((item) => item.userId === row.userId) : undefined
                  }
                />
              </UserIdentity>
              {terminated ? (
                <span
                  title={row.score ?? t`ND`}
                  className="ml-auto max-w-[40%] shrink-0 truncate text-right font-semibold tabular-nums"
                >
                  <span className="sr-only">{t`Score`}: </span>
                  {row.score ?? t`ND`}
                </span>
              ) : null}
            </GroupedRow>
          );
        })}
      </GroupedList>
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
        <p>{t`No players found`}</p>
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
