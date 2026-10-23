import {
  communityAccessDenied,
  useEventRecords,
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
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { EventCard } from "./EventCard";
export function Events({ groupId, canCreate = true }: { groupId?: string; canCreate?: boolean }) {
  const t = useT(),
    router = useRouter(),
    o = useCommunityApi(),
    layout = useFloatingActionLayout(),
    accent = useThemeColor("accent-foreground"),
    filters = useListSearch(["past", "future"] as const),
    list = useEventRecords(o, { groupId, periods: filters.selected, query: filters.search });
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={{ flex: 1 }}
        data={communityAccessDenied(list.error) ? [] : list.items}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{
          padding: 20,
          gap: 12,
          flexGrow: 1,
          paddingBottom: layout.paddingBottom,
        }}
        ListHeaderComponent={
          <ListSearch
            query={filters.query}
            onQueryChange={filters.setQuery}
            label={t("Search events")}
            placeholder={t("Search events")}
            selected={filters.selected}
            onToggle={filters.toggle}
            options={[
              { key: "past", label: t("Past"), icon: History },
              { key: "future", label: t("Future"), icon: CalendarDays },
            ]}
          />
        }
        renderItem={({ item }) => <EventCard event={item} />}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
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
          left={Boolean(groupId)}
          onPress={() =>
            router.push({ pathname: "/event/wizard", params: groupId ? { groupId } : {} })
          }
        >
          <Plus size={24} color={accent} />
        </FloatingActions>
      ) : null}
    </View>
  );
}
