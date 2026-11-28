import {
  type HistoryTableListOrder,
  historyTableListDefaultOrder,
  historyTableListSortFields,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useListSearch,
  useRecordTables,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Dices, History } from "lucide-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { ListOrdering } from "@/components/common/ui/ListOrdering";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useListSearchHeader } from "@/lib/useListSearchHeader";
import { EventTableCard } from "./EventTableCard";

const noFilters: readonly never[] = [];

export function TableList() {
  const [order, setOrder] = useState<HistoryTableListOrder>(historyTableListDefaultOrder);
  const muted = useThemeColor("muted");
  const t = useT(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets(),
    f = useListSearch(noFilters, 0),
    q = useRecordTables(o, null, { query: f.search, statuses: ["TERMINATED"], order });
  const headerSearch = useListSearchHeader<(typeof q.items)[number]>(f.reset);
  const renderItem = useCallback(
    ({ item }: { item: (typeof q.items)[number] }) => (
      <EventTableCard table={item} context="personal" />
    ),
    [],
  );
  return (
    <NotificationAttentionScope
      options={o}
      targets={(communityAccessDenied(q.error) ? [] : q.items).map((row) => ({
        kind: "table",
        id: row.id,
      }))}
    >
      <InputFlatList
        ref={headerSearch.listRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        data={communityAccessDenied(q.error) ? [] : q.items}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{
          padding: 20,
          paddingTop: headerSearch.active ? headerSearch.top + 8 : 20,
          gap: 12,
          flexGrow: 1,
          paddingBottom: insets.bottom + 32,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {!headerSearch.active ? (
              <HelpSectionCard title={t("History")} label={t("Table history help")} icon={History}>
                <Typography className="text-foreground">
                  {t(
                    "Confirmed tables from finished events where you played, were a demonstrator or are still a manager.",
                  )}
                </Typography>
              </HelpSectionCard>
            ) : null}
            <View style={{ gap: 8 }}>
              <ListSearch
                query={f.query}
                onQueryChange={f.setQuery}
                label={t("Filter")}
                placeholder={t("Filter tables")}
                mode="filter"
                selected={f.selected}
                onToggle={f.toggle}
                options={noFilters}
                headerSearch={headerSearch}
              />
              <ListOrdering fields={historyTableListSortFields} order={order} onChange={setOrder} />
            </View>
          </View>
        }
        renderItem={renderItem}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError) void q.fetchNextPage();
        }}
        ListEmptyComponent={
          q.isPending ? (
            <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
          ) : !q.isError && !q.hasNextPage ? (
            <EmptyList icon={<Dices size={28} color={muted} />}>{t("No tables found")}</EmptyList>
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
