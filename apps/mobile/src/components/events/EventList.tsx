import type { EventListSection } from "@board-game-organizer/schemas";
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
import { CalendarDays, History, Plus } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
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
}: {
  groupId?: string;
  canCreate?: boolean;
  section?: EventListSection;
}) {
  const t = useT(),
    router = useRouter(),
    o = useCommunityApi(),
    layout = useFloatingActionLayout(),
    accent = useThemeColor("accent-foreground"),
    filters = useListSearch(["past", "future"] as const, 0),
    list = useEventRecords(o, {
      groupId,
      section: groupId ? undefined : section,
      periods: filters.selected,
      query: filters.search,
    });
  // Warm the same source-filtered first page used by the creation picker; never scan all Groups.
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
      <View style={{ flex: 1 }}>
        <FlatList
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
            <ListSearch
              query={filters.query}
              onQueryChange={filters.setQuery}
              label={t("Filter")}
              placeholder={t("Filter events")}
              mode="filter"
              selected={filters.selected}
              onToggle={filters.toggle}
              options={[
                { key: "past", label: t("Past"), icon: History },
                { key: "future", label: t("Future"), icon: CalendarDays },
              ]}
            />
          }
          renderItem={({ item }) => (
            <EventCard
              event={item}
              context={groupId ? "group" : "personal"}
              checking={list.isFetching}
              onVerify={() => void list.refetch({ cancelRefetch: false })}
            />
          )}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetching && !list.isFetchNextPageError)
              void list.fetchNextPage();
          }}
          ListEmptyComponent={
            list.isPending ? (
              <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
            ) : !list.isError ? (
              <Typography className="text-foreground">{t("No events found")}</Typography>
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
