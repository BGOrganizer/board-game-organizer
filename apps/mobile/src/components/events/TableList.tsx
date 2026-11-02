import {
  communityAccessDenied,
  useListSearch,
  useRecordTables,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarDays, History } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventTableCard } from "./EventTableCard";
import { TableListHeading } from "./TableListHeading";
export function TableList() {
  const t = useT(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets(),
    f = useListSearch(["past", "future"] as const, 0),
    q = useRecordTables(o, null, { query: f.search, periods: f.selected });
  return (
    <NotificationAttentionScope
      options={o}
      targets={(communityAccessDenied(q.error) ? [] : q.items).map((row) => ({
        kind: "table",
        id: row.id,
      }))}
    >
      <FlatList
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        data={communityAccessDenied(q.error) ? [] : q.items}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{
          padding: 20,
          gap: 12,
          flexGrow: 1,
          paddingBottom: insets.bottom + 32,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <ListSearch
              query={f.query}
              onQueryChange={f.setQuery}
              label={t("Filter")}
              placeholder={t("Filter tables")}
              mode="filter"
              selected={f.selected}
              onToggle={f.toggle}
              options={[
                { key: "past", label: t("Past"), icon: History },
                { key: "future", label: t("Future"), icon: CalendarDays },
              ]}
            />
            <TableListHeading />
          </View>
        }
        renderItem={({ item }) => <EventTableCard table={item} context="personal" />}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError) void q.fetchNextPage();
        }}
        ListEmptyComponent={
          q.isPending ? (
            <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
          ) : !q.isError ? (
            <Typography className="text-foreground">{t("No tables found")}</Typography>
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {q.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load tables")}
                </Typography>
                <Button variant="outline" onPress={() => void q.refetch()}>
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              </>
            ) : null}
            {q.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ) : q.hasNextPage ? (
              <Button variant="outline" onPress={() => void q.fetchNextPage()}>
                <Button.Label>{t("Load more")}</Button.Label>
              </Button>
            ) : null}
          </View>
        }
      />
    </NotificationAttentionScope>
  );
}
