"use client";
import {
  type EventListFilterRole,
  type EventListSection,
  type EventListStatus,
  eventListDefaultOrder,
  eventListStatuses,
  type RecordListOrder,
  scheduledEventFilterRoles,
  terminatedEventFilterRoles,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useEventRecords,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  CalendarCheck,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarSearch,
  Clock3,
  Crown,
  Flag,
  Plus,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { ListOrdering } from "@/components/common/ui/ListOrdering";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { WindowedList } from "@/components/common/ui/WindowedList";
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
  const [order, setOrder] = useState<RecordListOrder>(eventListDefaultOrder[section]);
  const roles =
    section === "mine"
      ? scheduledEventFilterRoles
      : section === "terminated"
        ? terminatedEventFilterRoles
        : [];
  const { t } = useLingui(),
    o = useCommunityApi(),
    filters = useListSearch<EventListStatus | EventListFilterRole>(
      groupId ? eventListStatuses : roles,
      0,
    ),
    list = useEventRecords(o, {
      groupId,
      section: groupId ? undefined : section,
      statuses: groupId
        ? eventListStatuses.filter((status) => filters.selected.includes(status))
        : section === "available"
          ? ["PLANNING"]
          : section === "terminated"
            ? ["TERMINATED"]
            : ["CONFIRMED", "PLANNING"],
      query: filters.search,
      roles: groupId ? undefined : roles.filter((role) => filters.selected.includes(role)),
      order: groupId ? undefined : order,
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
  const sectionHelp = {
    mine: {
      title: t`Scheduled`,
      label: t`Scheduled events help`,
      icon: CalendarCheck,
      description: t`Planning or confirmed events where you are a manager, registered player or demonstrator. Waiting-list places and pending invitations are included.`,
    },
    available: {
      title: t`Available events`,
      label: t`Available events help`,
      icon: CalendarSearch,
      description: t`Group events in planning that are open for you to join. Private events require group membership. Public events are open to nonmembers too.`,
    },
    terminated: {
      title: t`Terminated events`,
      label: t`Terminated events help`,
      icon: Flag,
      description: t`Finished events where you played or demonstrated at a confirmed table, or that you still manage.`,
    },
  }[section];
  const roleLabels = {
    admin: { label: t({ id: "list.filter.admin", message: "Admin" }), icon: Crown },
    moderator: { label: t`Moderator`, icon: ShieldCheck },
    participant: { label: t`Participant`, icon: UserRoundCheck },
    pending: { label: t`Pending`, icon: Clock3 },
  };
  return (
    <NotificationAttentionScope
      options={o}
      targets={(communityAccessDenied(list.error) ? [] : list.items)
        .filter((row) => !row.optimistic)
        .map((row) => ({ kind: "event", id: row.id }))}
    >
      <ListPage hasFloatingActions={canCreate}>
        {groupId ? null : (
          <HelpSectionCard
            title={sectionHelp.title}
            label={sectionHelp.label}
            icon={sectionHelp.icon}
          >
            <p>{sectionHelp.description}</p>
          </HelpSectionCard>
        )}
        <ListSearch
          query={filters.query}
          onQueryChange={filters.setQuery}
          label={t`Filter`}
          placeholder={t`Filter events`}
          mode="filter"
          selected={filters.selected}
          onToggle={filters.toggle}
          options={
            !groupId
              ? roles.map((key) => ({ key, ...roleLabels[key] }))
              : [
                  { key: "CONFIRMED", label: t`Confirmed events`, icon: CalendarCheck2 },
                  { key: "PLANNING", label: t`Planning`, icon: CalendarClock },
                  { key: "TERMINATED", label: t`Terminated events`, icon: Flag },
                ]
          }
        />
        {!groupId ? <ListOrdering order={order} onChange={setOrder} /> : null}
        <WindowedList
          key={`${groupId ?? section}:${filters.search}`}
          items={communityAccessDenied(list.error) ? [] : list.items}
          itemKey={(event) => event.id}
          label={t`Events`}
          estimatedRowHeight={260}
          gap={12}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetching && !list.isFetchNextPageError)
              void list.fetchNextPage();
          }}
          renderItem={(event) => (
            <EventCard
              event={event}
              context={groupId ? "group" : "personal"}
              checking={list.isFetching}
              onVerify={() => void list.refetch({ cancelRefetch: false })}
            />
          )}
        />
        {list.isPending ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : !list.isError && !list.hasNextPage && !list.items.length ? (
          <EmptyList icon={<CalendarDays className="size-7" />}>{t`No events found`}</EmptyList>
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
