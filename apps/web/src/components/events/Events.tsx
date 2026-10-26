"use client";
import {
  communityAccessDenied,
  useEventRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, History, Plus } from "lucide-react";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventCard } from "./EventCard";
export function Events({ groupId, canCreate = true }: { groupId?: string; canCreate?: boolean }) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    filters = useListSearch(["past", "future"] as const),
    list = useEventRecords(o, { groupId, periods: filters.selected, query: filters.search }),
    end = useInfiniteScroll({
      hasNextPage: !!list.hasNextPage,
      isFetchingNextPage: list.isFetchingNextPage,
      isFetchNextPageError: list.isFetchNextPageError,
      fetchNextPage: list.fetchNextPage,
    });
  return (
    <ListPage>
      <ListSearch
        query={filters.query}
        onQueryChange={filters.setQuery}
        label={t`Search events`}
        placeholder={t`Search events`}
        selected={filters.selected}
        onToggle={filters.toggle}
        options={[
          { key: "past", label: t`Past`, icon: History },
          { key: "future", label: t`Future`, icon: CalendarDays },
        ]}
      />
      {(communityAccessDenied(list.error) ? [] : list.items).map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
      {list.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !list.isError && !list.items.length ? (
        <p>{t`No events found`}</p>
      ) : null}
      {list.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load events`}</p>
          <Button variant="outline" onPress={() => void list.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div ref={end} />
      {list.isFetchingNextPage ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : list.hasNextPage ? (
        <Button variant="outline" onPress={() => void list.fetchNextPage()}>
          {list.isFetchNextPageError ? t`Could not load events. Retry` : t`Load more`}
        </Button>
      ) : null}
      {canCreate ? (
        <FloatingActions
          href={`/events/new${groupId ? `?groupId=${groupId}` : ""}`}
          label={t`Create event`}
        >
          <Plus className="size-6" />
        </FloatingActions>
      ) : null}
    </ListPage>
  );
}
