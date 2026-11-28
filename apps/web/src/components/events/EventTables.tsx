"use client";
import {
  type EventTableListOrder,
  eventTableListDefaultOrder,
  eventTableListSortFields,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  filterEventDetailTables,
  useListSearch,
  type useRecordTables,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Dices } from "lucide-react";
import { type ReactNode, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { ListOrdering } from "@/components/common/ui/ListOrdering";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { WindowedList } from "@/components/common/ui/WindowedList";
import { useListSearchHeader } from "@/lib/useListSearchHeader";
import { useTableTitle } from "@/lib/useTableTitle";
import { EventTableCard } from "./EventTableCard";

const noFilters: readonly never[] = [];

export function EventTables({
  query: q,
  header,
  onSearchActiveChange,
}: {
  query: ReturnType<typeof useRecordTables>;
  header: ReactNode;
  onSearchActiveChange: (active: boolean) => void;
}) {
  const { t, i18n } = useLingui();
  const { getTableTitle } = useTableTitle();
  const filters = useListSearch(noFilters, 0);
  const [order, setOrder] = useState<EventTableListOrder>(eventTableListDefaultOrder);
  const headerSearch = useListSearchHeader(filters.reset, onSearchActiveChange);
  const items = communityAccessDenied(q.error)
    ? []
    : filterEventDetailTables(q.items, filters.search, order, getTableTitle, i18n.locale);
  const more = () => {
    if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError)
      void q.fetchNextPage({ cancelRefetch: false });
  };
  return (
    <>
      {!headerSearch.active ? header : null}
      <div className="space-y-2">
        <ListSearch
          mode="filter"
          label={t`Filter`}
          placeholder={t`Filter tables`}
          query={filters.query}
          onQueryChange={filters.setQuery}
          options={noFilters}
          selected={filters.selected}
          onToggle={filters.toggle}
          headerSearch={headerSearch}
        />
        <ListOrdering fields={eventTableListSortFields} order={order} onChange={setOrder} />
      </div>
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
        <EmptyList icon={<Dices className="size-7" />}>{t`No tables found`}</EmptyList>
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
