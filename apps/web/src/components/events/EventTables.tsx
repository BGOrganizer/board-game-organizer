"use client";
import { communityAccessDenied, type useRecordTables } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { WindowedList } from "@/components/common/ui/WindowedList";
import { EventTableCard } from "./EventTableCard";

export function EventTables({ query: q }: { query: ReturnType<typeof useRecordTables> }) {
  const { t } = useLingui();
  const items = communityAccessDenied(q.error) ? [] : q.items;
  const more = () => {
    if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError)
      void q.fetchNextPage({ cancelRefetch: false });
  };
  return (
    <>
      {items.length ? (
        <WindowedList
          key={items[0]?.eventId}
          items={items}
          itemKey={(row) => row.id}
          label={t`Table list`}
          estimatedRowHeight={260}
          gap={12}
          onEndReached={more}
          renderItem={(row) => <EventTableCard table={row} context="event" />}
        />
      ) : null}
      {!q.isPending && !q.isError && !items.length ? (
        <p role="status" className="text-muted">{t`No tables found`}</p>
      ) : null}
      {q.isPending || q.isFetchingNextPage ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load tables`}</p>
          <Button variant="secondary" onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      {q.hasNextPage ? (
        <Button
          variant="secondary"
          isDisabled={q.isFetching || q.isFetchNextPageError}
          onPress={more}
        >{t`Load more`}</Button>
      ) : null}
    </>
  );
}
