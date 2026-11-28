import {
  type EventListFilterRole,
  type EventListSection,
  type EventListStatus,
  eventListDefaultOrder,
  eventListStatuses,
  type RecordListOrder,
  recordListSortFields,
  scheduledEventFilterRoles,
  terminatedEventFilterRoles,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useEventRecords,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
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
} from "lucide-react-native";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { ListOrdering } from "@/components/common/ui/ListOrdering";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { useListSearchHeader } from "@/lib/useListSearchHeader";
import { EventCard } from "./EventCard";

const noEventRoles: readonly EventListFilterRole[] = [];
export function EventList({
  groupId,
  canCreate = true,
  section = "mine",
  header,
  onSearchActiveChange,
}: {
  groupId?: string;
  canCreate?: boolean;
  section?: EventListSection;
  onSearchActiveChange?: (active: boolean) => void;
  header?: ReactNode;
}) {
  const [order, setOrder] = useState<RecordListOrder>(eventListDefaultOrder[section]);
  const roles =
    section === "mine"
      ? scheduledEventFilterRoles
      : section === "terminated"
        ? terminatedEventFilterRoles
        : noEventRoles;
  const muted = useThemeColor("muted");
  const t = useT(),
    { _: translate } = useLingui(),
    router = useRouter(),
    o = useCommunityApi(),
    layout = useFloatingActionLayout(canCreate),
    accent = useThemeColor("accent-foreground"),
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
      order,
    });
  const headerSearch = useListSearchHeader<(typeof list.items)[number]>(
    filters.reset,
    onSearchActiveChange,
  );
  // Warm the same source-filtered first page used by the creation picker; never scan all Groups.
  useGroupRecords({ ...o, enabled: o.enabled !== false && !groupId && canCreate }, "mine", "", [
    "admin",
  ]);
  const verify = useCallback(() => void list.refetch({ cancelRefetch: false }), [list.refetch]);
  const renderItem = useCallback(
    ({ item }: { item: (typeof list.items)[number] }) => (
      <EventCard
        event={item}
        context={groupId ? "group" : "personal"}
        checking={item.optimistic?.phase === "verifying" && list.isFetching}
        onVerify={item.optimistic?.phase === "verifying" ? verify : undefined}
      />
    ),
    [groupId, list.isFetching, verify],
  );
  const { query, setQuery, selected, toggle } = filters;
  const listHeader = useMemo(() => {
    const sectionHelp = {
      mine: {
        title: t("Scheduled"),
        label: t("Scheduled events help"),
        icon: CalendarCheck,
        description: t(
          "Planning or confirmed events where you are a manager, registered player or demonstrator. Waiting-list places and pending invitations are included.",
        ),
      },
      available: {
        title: t("Available"),
        label: t("Available events help"),
        icon: CalendarSearch,
        description: t(
          "Group events in planning that are open for you to join. Private events require group membership. Public events are open to nonmembers too.",
        ),
      },
      terminated: {
        title: t("Terminated events"),
        label: t("Terminated events help"),
        icon: Flag,
        description: t(
          "Finished events where you played or demonstrated at a confirmed table, or that you still manage.",
        ),
      },
    }[section];
    const roleLabels = {
      admin: { label: translate({ id: "list.filter.admin", message: "Admin" }), icon: Crown },
      moderator: { label: t("Moderator"), icon: ShieldCheck },
      participant: { label: t("Participant"), icon: UserRoundCheck },
      pending: { label: t("Pending"), icon: Clock3 },
    };
    return (
      <View style={{ gap: 12 }}>
        {!headerSearch.active && header != null && header !== false ? <View>{header}</View> : null}
        {!groupId && !headerSearch.active ? (
          <HelpSectionCard
            title={sectionHelp.title}
            label={sectionHelp.label}
            icon={sectionHelp.icon}
          >
            <Typography className="text-foreground">{sectionHelp.description}</Typography>
          </HelpSectionCard>
        ) : null}
        <View style={{ gap: 8 }}>
          <ListSearch
            headerSearch={headerSearch}
            query={query}
            onQueryChange={setQuery}
            label={t("Filter")}
            placeholder={t("Filter events")}
            mode="filter"
            selected={selected}
            onToggle={toggle}
            options={
              !groupId
                ? roles.map((key) => ({ key, ...roleLabels[key] }))
                : [
                    { key: "CONFIRMED", label: t("Confirmed events"), icon: CalendarCheck2 },
                    { key: "PLANNING", label: t("Planning"), icon: CalendarClock },
                    { key: "TERMINATED", label: t("Terminated events"), icon: Flag },
                  ]
            }
          />
          <ListOrdering fields={recordListSortFields} order={order} onChange={setOrder} />
        </View>
      </View>
    );
  }, [
    header,
    groupId,
    section,
    roles,
    order,
    query,
    selected,
    setQuery,
    toggle,
    t,
    translate,
    headerSearch,
  ]);
  return (
    <NotificationAttentionScope
      options={o}
      targets={(communityAccessDenied(list.error) ? [] : list.items)
        .filter((row) => !row.optimistic)
        .map((row) => ({ kind: "event", id: row.id }))}
    >
      <View style={{ flex: 1 }}>
        <InputFlatList
          ref={headerSearch.listRef}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={groupId ? 1 : undefined}
          maxToRenderPerBatch={groupId ? 1 : undefined}
          data={communityAccessDenied(list.error) ? [] : list.items}
          keyExtractor={(row) => row.id}
          contentContainerStyle={{
            padding: 20,
            paddingTop: headerSearch.active ? headerSearch.top + 4 : groupId ? 0 : 8,
            gap: 12,
            flexGrow: 1,
            paddingBottom: layout.paddingBottom,
          }}
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetching && !list.isFetchNextPageError)
              void list.fetchNextPage();
          }}
          ListEmptyComponent={
            list.isPending ? (
              <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
            ) : !list.isError && !list.hasNextPage ? (
              <EmptyList icon={<CalendarDays size={28} color={muted} />}>
                {t("No events found")}
              </EmptyList>
            ) : null
          }
          ListFooterComponent={
            <View style={{ gap: 12 }}>
              {list.isError ? (
                <>
                  <Typography accessibilityRole="alert" className="text-danger">
                    {t("Could not load events")}
                  </Typography>
                  <Button variant="outline" onPress={() => void list.refetch()}>
                    <Button.Label>{t("Try again")}</Button.Label>
                  </Button>
                </>
              ) : null}
              {list.isFetchingNextPage ? (
                <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
              ) : list.hasNextPage ? (
                <Button variant="outline" onPress={() => void list.fetchNextPage()}>
                  <Button.Label>{t("Load more")}</Button.Label>
                </Button>
              ) : null}
            </View>
          }
        />
        {canCreate ? (
          <FloatingActions
            label={t("Create event")}
            onPress={() =>
              router.push({ pathname: "/event/wizard", params: groupId ? { groupId } : {} })
            }
          >
            <Plus size={24} color={accent} />
          </FloatingActions>
        ) : null}
      </View>
    </NotificationAttentionScope>
  );
}
