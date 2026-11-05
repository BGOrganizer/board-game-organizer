import type { BggCollectionCounts, BggCollectionItem } from "@board-game-organizer/schemas";
import {
  bggCollectionQuery,
  communityAccessDenied,
  useBggCollection,
  useListSearch,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { hashKey } from "@tanstack/react-query";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { memo, type ReactNode, useCallback, useLayoutEffect, useRef } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GameListRow } from "@/components/games/GameListRow";
import { GAME_PICKER_CHUNK_SIZE } from "@/lib/games/gamePickerWindow";
import { useGameListWindow } from "@/lib/games/useGameListWindow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileStats } from "./ProfileStats";

const noFilters: readonly string[] = [];
const noExclusions = new Set<number>();
const key = (item: BggCollectionItem) => String(item.id);
export function ProfileCollection({
  snapshot,
  counts: knownCounts,
  header,
  footer,
}: {
  snapshot: string;
  counts?: BggCollectionCounts;
  header: ReactNode;
  footer: ReactNode;
}) {
  const t = useT(),
    { i18n } = useLingui(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets();
  const filter = useListSearch(noFilters, 0);
  const options = { ...o, snapshot, query: filter.search };
  const q = useBggCollection(options);
  const scope = hashKey(bggCollectionQuery(options).queryKey);
  const pages = communityAccessDenied(q.error) ? undefined : q.data?.pages;
  const window = useGameListWindow({ scope, pages, excludedIds: noExclusions, ...q });
  const list = useRef<FlatList<BggCollectionItem>>(null);
  const previousScope = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [scope]);
  const counts = communityAccessDenied(q.error) ? undefined : (pages?.[0]?.counts ?? knownCounts);
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const label = t("Personal BGG rating"),
    unavailable = t("N/A");
  const renderItem = useCallback(
    ({ item }: { item: BggCollectionItem }) => (
      <CollectionRow item={item} locale={i18n.locale} label={label} unavailable={unavailable} />
    ),
    [i18n.locale, label, unavailable],
  );
  return (
    <FlatList
      ref={list}
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: insets.bottom + 24 }}
      keyboardShouldPersistTaps="handled"
      data={window.items}
      keyExtractor={key}
      initialNumToRender={GAME_PICKER_CHUNK_SIZE}
      maxToRenderPerBatch={6}
      windowSize={7}
      onScrollBeginDrag={window.beginScroll}
      onEndReached={window.endReached}
      onEndReachedThreshold={0.4}
      renderItem={renderItem}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 8 }}>
          {header}
          {q.isPending && !counts ? (
            <Skeleton style={{ width: "100%", height: 76, borderRadius: 12 }} />
          ) : (
            <ProfileStats
              items={[
                {
                  label: t("Games without expansions"),
                  value: counts ? number.format(counts.withoutExpansions) : unavailable,
                },
                {
                  label: t("Games including expansions"),
                  value: counts ? number.format(counts.withExpansions) : unavailable,
                },
                {
                  label: t("Wishlist"),
                  value: counts ? number.format(counts.wishlist) : unavailable,
                },
              ]}
            />
          )}
          {pages?.[0]?.counts === null && !knownCounts ? (
            <Typography className="text-sm text-muted">
              {t("Synchronize again to include expansions and collection counts.")}
            </Typography>
          ) : null}
          <SearchInput
            value={filter.query}
            onChange={filter.setQuery}
            label={t("Filter collection")}
            placeholder={t("Filter games in your collection")}
            testID="profile-collection-filter"
            maxLength={120}
          />
          {q.isError ? (
            <View style={{ gap: 8 }}>
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Could not load collection")}
              </Typography>
              <Button variant="secondary" onPress={() => void q.refetch()}>
                <Button.Label>{t("Try again")}</Button.Label>
              </Button>
            </View>
          ) : null}
          {q.isPending && !pages ? (
            <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
          ) : null}
          {!q.isPending && !q.isError && !window.hasMore && window.items.length === 0 ? (
            <Typography accessibilityLiveRegion="polite" className="text-muted">
              {t("No games found")}
            </Typography>
          ) : null}
        </View>
      }
      ListFooterComponent={
        <View style={{ gap: 16, marginTop: 8 }}>
          {q.isFetchingNextPage ? (
            <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
          ) : null}
          {window.hasMore ? (
            <Button
              variant="secondary"
              isDisabled={!window.hasCachedMore && (q.isFetching || q.isError)}
              onPress={window.loadMore}
            >
              <Button.Label>{t("Load more games")}</Button.Label>
            </Button>
          ) : null}
          {footer}
        </View>
      }
    />
  );
}

const CollectionRow = memo(function CollectionRow({
  item,
  locale,
  label,
  unavailable,
}: {
  item: BggCollectionItem;
  locale: string;
  label: string;
  unavailable: string;
}) {
  const rating =
    item.userRating === null
      ? unavailable
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.userRating);
  return (
    <GroupedList>
      <GameListRow
        name={item.name}
        imageUrl={item.imageUrl}
        year={item.year}
        average={item.average}
        rank={item.rank}
        actions={
          <Typography
            accessibilityLabel={`${label}: ${rating}`}
            className="font-semibold text-foreground"
            style={{ minWidth: 44, textAlign: "center" }}
          >
            {rating}
          </Typography>
        }
      />
    </GroupedList>
  );
});
