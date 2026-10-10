"use client";
import { eventPeriods } from "@board-game-organizer/schemas";
import { communityAccessDenied, useEventList, useListSearch } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarClock, CalendarDays, History } from "lucide-react";

import { EmptyList } from "@/components/common/ui/EmptyList";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventCard } from "./EventCard";

export function Events({ organizationId = "" }: { organizationId?: string }) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const filters = useListSearch(eventPeriods);
  const list = useEventList(options, organizationId, filters.search, filters.selected);
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
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
          { key: "future", label: t`Future`, icon: CalendarClock },
          { key: "past", label: t`Past`, icon: History },
        ]}
      />
      {list.isPending ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
      {(communityAccessDenied(list.error) ? [] : list.items).map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
      {list.isError ? (
        <div role="alert">
          <p>{t`Could not load events`}</p>
          <Button variant="outline" onPress={() => void list.refetch()}>{t`Retry`}</Button>
        </div>
      ) : null}
      {!list.isPending && !list.isError && !list.items.length ? (
        <EmptyList icon={<CalendarDays className="size-7" />}>{t`No events found`}</EmptyList>
      ) : null}
      <div ref={sentinel} />
      {list.isFetchingNextPage ? <Skeleton className="h-20 w-full rounded-xl" /> : null}
      {list.hasNextPage ? (
        <Button
          isDisabled={list.isFetchingNextPage}
          onPress={() => void list.fetchNextPage()}
        >{t`Load more`}</Button>
      ) : null}
    </ListPage>
  );
}
