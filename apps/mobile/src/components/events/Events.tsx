import { eventPeriods } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  formatLocationAddress,
  useEventList,
  useListSearch,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";

import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarClock, History } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListPage, listPageContentStyle } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function Events({ organizationId = "" }: { organizationId?: string }) {
  const t = useT();
  const o = useCommunityApi();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
          paddingBottom: insets.bottom + 20,
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
          !list.isPending && !list.isError ? <Typography>{t("No events found")}</Typography> : null
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
        renderItem={({ item }) => (
          <LinkedListCard
            onPress={() => router.push(`/event/${item.id}`)}
            label={`${t("Open event")}: ${item.name}`}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Typography className="font-semibold">{item.name}</Typography>
              <Typography>
                {item.organizationName} · {item.status === "DRAFT" ? t("Draft") : t("Published")}
              </Typography>
              <Typography>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: item.timeZone,
                }).format(new Date(item.startsAt))}
              </Typography>
              <Typography className="text-muted">
                {formatLocationAddress(item.location.address)}
              </Typography>
            </View>
          </LinkedListCard>
        )}
      />
    </ListPage>
  );
}
