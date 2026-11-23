"use client";
import {
  communityAccessDenied,
  useListSearch,
  useRecordTables,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Dices, History } from "lucide-react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { WindowedList } from "@/components/common/ui/WindowedList";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventTableCard } from "./EventTableCard";
export function TableList() {
  const { t } = useLingui(),
    o = useCommunityApi(),
    f = useListSearch(["TERMINATED"] as const, 0),
    q = useRecordTables(o, null, { query: f.search, statuses: ["TERMINATED"] }),
    end = useInfiniteScroll({
      hasNextPage: !!q.hasNextPage,
      isFetchingNextPage: q.isFetchingNextPage,
      isFetchNextPageError: q.isFetchNextPageError,
      fetchNextPage: q.fetchNextPage,
    });
  return (
    <NotificationAttentionScope
      options={o}
      targets={(communityAccessDenied(q.error) ? [] : q.items).map((row) => ({
        kind: "table",
        id: row.id,
      }))}
    >
      <ListPage>
        <HelpSectionCard title={t`History`} label={t`Table history help`} icon={History}>
          <p>{t`Confirmed tables from finished events where you played, were a demonstrator or are still a manager.`}</p>
        </HelpSectionCard>
        <ListSearch
          query={f.query}
          onQueryChange={f.setQuery}
          label={t`Filter`}
          placeholder={t`Filter tables`}
          mode="filter"
          selected={f.selected}
          onToggle={f.toggle}
          options={[]}
        />
        <WindowedList
          key={f.search}
          items={communityAccessDenied(q.error) ? [] : q.items}
          itemKey={(row) => row.id}
          label={t`History`}
          estimatedRowHeight={260}
          gap={12}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError) void q.fetchNextPage();
          }}
          renderItem={(row) => <EventTableCard table={row} context="personal" />}
        />
        {q.isPending ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : !q.isError && !q.hasNextPage && !q.items.length ? (
          <EmptyList icon={<Dices className="size-7" />}>{t`No tables found`}</EmptyList>
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
    </NotificationAttentionScope>
  );
}
