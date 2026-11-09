import type { BggCollectionCounts, BggCollectionItem } from "@board-game-organizer/schemas";
import {
  bggCollectionQuery,
  communityAccessDenied,
  GAME_PICKER_CHUNK_SIZE,
  useBggCollection,
  useBggCollectionFilters,
  useGameListWindow,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { hashKey } from "@tanstack/react-query";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Gamepad2, Heart, Puzzle, UsersRound } from "lucide-react-native";
import { memo, type ReactNode, useCallback, useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { InputSectionList } from "@/components/common/ui/InputSectionList";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GameListCard } from "@/components/games/GameListCard";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileStats } from "./ProfileStats";

const noExclusions = new Set<number>();
const key = (item: BggCollectionItem) => String(item.id);
export function ProfileCollection({
  snapshot,
  counts: knownCounts,
  header,
  subjectId,
  viewerSnapshot,
}: {
  snapshot: string;
  counts?: BggCollectionCounts;
  header: ReactNode;
  subjectId: string;
  viewerSnapshot?: string;
}) {
  const t = useT(),
    { i18n } = useLingui(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets();
  const other = subjectId !== o.userId;
  const filter = useBggCollectionFilters(viewerSnapshot);
  const options = {
    ...o,
    snapshot,
    subjectId,
    query: filter.search,
    types: filter.types,
    wishlist: filter.wishlist,
    commonSnapshot: other ? filter.commonSnapshot : undefined,
  };
  const q = useBggCollection(options),
    scope = hashKey(bggCollectionQuery(options).queryKey);
  const pages = communityAccessDenied(q.error) ? undefined : q.data?.pages;
  const window = useGameListWindow({ scope, pages, excludedIds: noExclusions, ...q });
  const sections = useMemo(() => [{ key: "games", data: window.items }], [window.items]);
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
    <InputSectionList
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: insets.bottom + 24,
        flexGrow: 1,
      }}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled
      sections={sections}
      keyExtractor={key}
      initialNumToRender={GAME_PICKER_CHUNK_SIZE}
      maxToRenderPerBatch={6}
      windowSize={7}
      onScrollBeginDrag={window.beginScroll}
      onEndReached={window.endReached}
      onEndReachedThreshold={0.4}
      accessibilityActions={
        window.hasMore ? [{ name: "increment", label: t("Load more games") }] : []
      }
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "increment") window.loadMore();
      }}
      renderItem={renderItem}
      ItemSeparatorComponent={GameGap}
      ListHeaderComponent={
        <View style={{ gap: 16, paddingBottom: 16 }}>
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
          {pages?.[0]?.counts === null && !knownCounts && !other ? (
            <Typography className="text-sm text-muted">
              {t("Synchronize again to include expansions and collection counts.")}
            </Typography>
          ) : null}
        </View>
      }
      renderSectionHeader={() => (
        <View className="bg-background" style={{ gap: 8, paddingVertical: 8 }}>
          <SearchInput
            value={filter.query}
            onChange={filter.setQuery}
            label={t("Filter collection")}
            placeholder={t("Filter collection games")}
            testID="profile-collection-filter"
            maxLength={120}
          />
          <FilterChips
            selected={filter.selected}
            onToggle={filter.toggle}
            options={[
              { key: "games", label: t("Games"), icon: Gamepad2 },
              { key: "expansions", label: t("Expansions"), icon: Puzzle },
              { key: "wishlist", label: t("Wishlist"), icon: Heart },
              ...(other
                ? [
                    {
                      key: "common" as const,
                      label: t("In common"),
                      icon: UsersRound,
                      disabled: !viewerSnapshot,
                    },
                  ]
                : []),
            ]}
          />
          {other && !viewerSnapshot ? (
            <Typography className="text-sm text-muted">
              {t("Synchronize your BGG collection to find games in common.")}
            </Typography>
          ) : null}
        </View>
      )}
      renderSectionFooter={() => (
        <View
          style={{
            gap: 12,
          }}
        >
          {q.isError ? (
            <>
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Could not load collection")}
              </Typography>
              <Button variant="secondary" onPress={() => void q.refetch()}>
                <Button.Label>{t("Try again")}</Button.Label>
              </Button>
            </>
          ) : null}
          {q.isPending && !pages ? (
            <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
          ) : null}
          {!q.isPending && !q.isError && !window.hasMore && !window.items.length ? (
            <Typography accessibilityLiveRegion="polite" className="text-muted">
              {t("No games found")}
            </Typography>
          ) : null}
          {q.isFetchingNextPage ? (
            <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
          ) : null}
        </View>
      )}
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
    <GameListCard
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
  );
});
function GameGap() {
  return <View style={{ height: 8 }} />;
}
