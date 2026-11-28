import {
  type EventTableListOrder,
  eventTableListDefaultOrder,
  eventTableListSortFields,
  type PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  filterEventDetailTables,
  useListSearch,
  type useRecordTables,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Dices } from "lucide-react-native";
import { type ReactNode, type RefObject, useCallback, useMemo, useState } from "react";
import { type FlatList, type ScrollView, View } from "react-native";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { ListOrdering } from "@/components/common/ui/ListOrdering";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { ScrollTargetContext } from "@/components/common/ui/ScrollTargetContext";
import { useTableTitle } from "@/lib/events/useTableTitle";
import { useT } from "@/lib/i18n";
import { useListSearchHeader } from "@/lib/useListSearchHeader";
import { EventTableCard } from "./EventTableCard";

const noFilters: readonly never[] = [];
const renderTable = ({ item }: { item: PlannedTableResponse }) => (
  <EventTableCard table={item} context="event" />
);

export function EventTables({
  query: q,
  header,
  paddingBottom,
  scrollTarget,
}: {
  query: ReturnType<typeof useRecordTables>;
  header: ReactNode;
  paddingBottom: number;
  scrollTarget: RefObject<ScrollView | null>;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const title = useTableTitle();
  const muted = useThemeColor("muted");
  const filters = useListSearch(noFilters, 0);
  const [order, setOrder] = useState<EventTableListOrder>(eventTableListDefaultOrder);
  const headerSearch = useListSearchHeader<PlannedTableResponse>(filters.reset);
  const { listRef } = headerSearch;
  const setList = useCallback(
    (node: FlatList<PlannedTableResponse> | null) => {
      listRef.current = node;
      scrollTarget.current = (node?.getNativeScrollRef() as ScrollView | null) ?? null;
    },
    [listRef, scrollTarget],
  );
  const accessDenied = communityAccessDenied(q.error);
  const items = useMemo(
    () =>
      accessDenied
        ? []
        : filterEventDetailTables(q.items, filters.search, order, title, i18n.locale),
    [accessDenied, q.items, filters.search, order, title, i18n.locale],
  );
  const more = useCallback(() => {
    if (q.hasNextPage && !q.isFetching && !q.isFetchNextPageError)
      void q.fetchNextPage({ cancelRefetch: false });
  }, [q.hasNextPage, q.isFetching, q.isFetchNextPageError, q.fetchNextPage]);
  return (
    <ScrollTargetContext.Provider value={scrollTarget}>
      <InputFlatList
        ref={setList}
        data={items}
        keyExtractor={(row) => row.id}
        renderItem={renderTable}
        onEndReached={more}
        contentContainerStyle={{
          padding: 20,
          paddingTop: headerSearch.active ? headerSearch.top + 4 : 12,
          paddingBottom,
          gap: 12,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {!headerSearch.active ? header : null}
            <View style={{ gap: 8 }}>
              <ListSearch
                mode="filter"
                label={t("Filter")}
                placeholder={t("Filter tables")}
                query={filters.query}
                onQueryChange={filters.setQuery}
                options={noFilters}
                selected={filters.selected}
                onToggle={filters.toggle}
                headerSearch={headerSearch}
              />
              <ListOrdering fields={eventTableListSortFields} order={order} onChange={setOrder} />
            </View>
          </View>
        }
        ListEmptyComponent={
          !q.isPending && !q.isError ? (
            <EmptyList icon={<Dices size={28} color={muted} />}>{t("No tables found")}</EmptyList>
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {q.isPending || q.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
            ) : null}
            {q.isError ? (
              <>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load tables")}
                </Typography>
                <Button onPress={() => void q.refetch()}>
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              </>
            ) : null}
            {q.hasNextPage ? (
              <Button
                isDisabled={q.isFetchingNextPage}
                onPress={() => void q.fetchNextPage({ cancelRefetch: false })}
              >
                <Button.Label>{t("Load more")}</Button.Label>
              </Button>
            ) : null}
          </View>
        }
      />
    </ScrollTargetContext.Provider>
  );
}
