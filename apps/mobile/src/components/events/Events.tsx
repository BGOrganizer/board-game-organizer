import { eventPeriods } from "@board-game-organizer/schemas";
import { communityAccessDenied, useEventList, useListSearch } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { CalendarClock, CalendarDays, History } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyList } from "@/components/common/ui/EmptyList";
import { ListPage, listPageContentStyle } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { EventCard } from "./EventCard";

export function Events({ organizationId = "" }: { organizationId?: string }) {
  const t = useT();
  const o = useCommunityApi();
  const muted = useThemeColor("muted");
  const insets = useSafeAreaInsets();
  const layout = useFloatingActionLayout();
  const filters = useListSearch(eventPeriods);
  const list = useEventList(o, organizationId, filters.search, filters.selected);
  return (
    <ListPage>
      <FlatList
        testID="events-scroll"
        style={{ flex: 1 }}
        data={communityAccessDenied(list.error) ? [] : list.items}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          ...listPageContentStyle,
          paddingTop: organizationId ? 0 : 20,
          paddingBottom: organizationId ? layout.paddingBottom : insets.bottom + 20,
        }}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
            void list.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <ListSearch
              query={filters.query}
              onQueryChange={filters.setQuery}
              label={t("Search events")}
              placeholder={t("Search events")}
              selected={filters.selected}
              onToggle={filters.toggle}
              options={[
                { key: "future", label: t("Future"), icon: CalendarClock },
                { key: "past", label: t("Past"), icon: History },
              ]}
            />
            {list.isPending ? (
              <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !list.isPending && !list.isError ? (
            <EmptyList icon={<CalendarDays size={28} color={muted} />}>
              {t("No events found")}
            </EmptyList>
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: 8 }}>
            {list.isError ? (
              <Button onPress={() => void list.refetch()}>
                {t("Could not load events. Retry")}
              </Button>
            ) : null}
            {list.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
            {list.isFetchNextPageError ? (
              <Button onPress={() => void list.fetchNextPage()}>{t("Retry")}</Button>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <EventCard event={item} />}
      />
    </ListPage>
  );
}
