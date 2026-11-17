import { type EventListSection, eventListStatuses } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useEventRecords,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarCheck2, CalendarClock, CalendarDays, Flag, Plus } from "lucide-react-native";
import { type ReactNode, useCallback } from "react";
import { View } from "react-native";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { EventCard } from "./EventCard";
export function EventList({
  groupId,
  canCreate = true,
  section = "mine",
  header,
}: {
  groupId?: string;
  canCreate?: boolean;
  section?: EventListSection;
  header?: ReactNode;
}) {
  const muted = useThemeColor("muted");
  const t = useT(),
    router = useRouter(),
    o = useCommunityApi(),
    layout = useFloatingActionLayout(canCreate),
    accent = useThemeColor("accent-foreground"),
    filters = useListSearch(eventListStatuses, 0),
    list = useEventRecords(o, {
      groupId,
      section: groupId ? undefined : section,
      statuses: groupId
        ? filters.selected
        : section === "available"
          ? ["PLANNING"]
          : section === "terminated"
            ? ["TERMINATED"]
            : ["CONFIRMED", "PLANNING"],
      query: filters.search,
    });
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
  return (
    <NotificationAttentionScope
      options={o}
      targets={(communityAccessDenied(list.error) ? [] : list.items)
        .filter((row) => !row.optimistic)
        .map((row) => ({ kind: "event", id: row.id }))}
    >
      <View style={{ flex: 1 }}>
        <InputFlatList
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          data={communityAccessDenied(list.error) ? [] : list.items}
          keyExtractor={(row) => row.id}
          contentContainerStyle={{
            padding: 20,
            paddingTop: groupId ? 0 : 8,
            gap: 12,
            flexGrow: 1,
            paddingBottom: layout.paddingBottom,
          }}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              {header === undefined || header === null || header === false ? null : (
                <View>{header}</View>
              )}
              <ListSearch
                query={filters.query}
                onQueryChange={filters.setQuery}
                label={t("Filter")}
                placeholder={t("Filter events")}
                mode="filter"
                selected={filters.selected}
                onToggle={filters.toggle}
                options={
                  !groupId
                    ? []
                    : [
                        { key: "CONFIRMED", label: t("Confirmed events"), icon: CalendarCheck2 },
                        { key: "PLANNING", label: t("Planning"), icon: CalendarClock },
                        { key: "TERMINATED", label: t("Terminated events"), icon: Flag },
                      ]
                }
              />
            </View>
          }
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
