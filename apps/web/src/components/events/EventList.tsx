"use client";
import { type EventListSection, eventListStatuses } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useEventRecords,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarCheck2, CalendarClock, Flag, Plus } from "lucide-react";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { EventCard } from "./EventCard";
export function EventList({
  groupId,
  canCreate = true,
  section = "mine",
}: {
  groupId?: string;
  canCreate?: boolean;
  section?: EventListSection;
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    filters = useListSearch(eventListStatuses, 0),
    list = useEventRecords(o, {
      groupId,
      section: groupId ? undefined : section,
      statuses: !groupId && section === "available" ? ["PLANNING"] : filters.selected,
      query: filters.search,
    }),
    end = useInfiniteScroll({
      hasNextPage: !!list.hasNextPage,
      isFetchingNextPage: list.isFetchingNextPage,
      isFetchNextPageError: list.isFetchNextPageError,
      fetchNextPage: list.fetchNextPage,
    });
  // Share the creation picker's bounded, source-filtered cache before navigation.
  useGroupRecords({ ...o, enabled: o.enabled !== false && !groupId && canCreate }, "mine", "", [
    "admin",
  ]);
  return (
    <NotificationAttentionScope
      options={o}
      targets={(communityAccessDenied(list.error) ? [] : list.items)
        .filter((row) => !row.optimistic)
        .map((row) => ({ kind: "event", id: row.id }))}
    >
      <ListPage>
        <ListSearch
          query={filters.query}
          onQueryChange={filters.setQuery}
          label={t`Filter`}
          placeholder={t`Filter events`}
          mode="filter"
          selected={filters.selected}
          onToggle={filters.toggle}
          options={
            !groupId && section === "available"
              ? []
              : [
                  { key: "CONFIRMED", label: t`Confirmed events`, icon: CalendarCheck2 },
                  { key: "PLANNING", label: t`Planning`, icon: CalendarClock },
                  { key: "TERMINATED", label: t`Terminated events`, icon: Flag },
                ]
          }
        />
        {(communityAccessDenied(list.error) ? [] : list.items).map((event) => (
          <EventCard
            key={event.id}
            event={event}
            context={groupId ? "group" : "personal"}
            checking={list.isFetching}
            onVerify={() => void list.refetch({ cancelRefetch: false })}
          />
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
    </NotificationAttentionScope>
  );
}
