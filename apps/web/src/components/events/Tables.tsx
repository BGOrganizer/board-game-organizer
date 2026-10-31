"use client";
import {
  communityAccessDenied,
  useListSearch,
  useRecordTables,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, History } from "lucide-react";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventTableCard } from "./EventTableCard";
export function Tables() {
  const { t } = useLingui(),
    o = useCommunityApi(),
    f = useListSearch(["past", "future"] as const),
    q = useRecordTables(o, null, { query: f.search, periods: f.selected }),
    end = useInfiniteScroll({
      hasNextPage: !!q.hasNextPage,
      isFetchingNextPage: q.isFetchingNextPage,
      isFetchNextPageError: q.isFetchNextPageError,
      fetchNextPage: q.fetchNextPage,
    });
  return (
    <ListPage>
      <ListSearch
        query={f.query}
        onQueryChange={f.setQuery}
        label={t`Search tables`}
        placeholder={t`Search tables`}
        selected={f.selected}
        onToggle={f.toggle}
        options={[
          { key: "past", label: t`Past`, icon: History },
          { key: "future", label: t`Future`, icon: CalendarDays },
        ]}
      />
      {(communityAccessDenied(q.error) ? [] : q.items).map((row) => (
        <EventTableCard key={row.id} table={row} context="personal" />
      ))}
      {q.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !q.isError && !q.items.length ? (
        <p>{t`No tables found`}</p>
      ) : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load tables`}</p>
          <Button variant="outline" onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div ref={end} />
      {q.isFetchingNextPage ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : q.hasNextPage ? (
        <Button variant="outline" onPress={() => void q.fetchNextPage()}>{t`Load more`}</Button>
      ) : null}
    </ListPage>
  );
}
