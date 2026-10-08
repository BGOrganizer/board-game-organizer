"use client";
import { eventPeriods } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  formatLocationAddress,
  useEventList,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarClock, CalendarDays, History } from "lucide-react";

import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

export function Events({ organizationId = "" }: { organizationId?: string }) {
  const { t, i18n } = useLingui();
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
        <LinkedListCard
          key={event.id}
          href={`/events/${event.id}`}
          label={`${t`Open event`}: ${event.name}`}
        >
          <CalendarDays aria-hidden className="size-6 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{event.name}</span>
            <span className="block text-sm">
              {event.organizationName} · {event.status === "DRAFT" ? t`Draft` : t`Published`}
            </span>
            <time dateTime={event.startsAt}>
              {new Intl.DateTimeFormat(i18n.locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: event.timeZone,
              }).format(new Date(event.startsAt))}
            </time>
            <span className="block truncate text-sm">
              {formatLocationAddress(event.location.address)}
            </span>
          </span>
        </LinkedListCard>
      ))}
      {list.isError ? (
        <div role="alert">
          <p>{t`Could not load events`}</p>
          <Button variant="outline" onPress={() => void list.refetch()}>{t`Retry`}</Button>
        </div>
      ) : null}
      {!list.isPending && !list.isError && !list.items.length ? <p>{t`No events found`}</p> : null}
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
