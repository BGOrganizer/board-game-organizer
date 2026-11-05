import type { BggPickerItem, BggThingResponse } from "@board-game-organizer/schemas";
import {
  bggPickerQuery,
  resolveApiUrl,
  useBggAccount,
  useBggPicker,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { hashKey } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Gamepad2, LibraryBig, Plus, Search } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { HeaderBackButton } from "@/components/common/layout/HeaderBackButton";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GameListRow } from "@/components/games/GameListRow";
import { GAME_PICKER_CHUNK_SIZE, gamePickerWindow } from "@/lib/games/gamePickerWindow";
import { useT } from "@/lib/i18n";
import { useSessionAuth } from "@/lib/useSessionAuth";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export default function GamePicker({
  onSelect,
  onClose,
  excludeIds,
}: {
  excludeIds?: readonly number[];
  onSelect?: (game: BggThingResponse) => void;
  onClose?: () => void;
} = {}) {
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const t = useT();
  const [muted, accentForeground] = useThemeColor(["muted", "accent-foreground"]);
  const router = useRouter();
  const { slotId, exclude } = useLocalSearchParams<{ slotId: string; exclude?: string }>();
  const setPendingGame = useAppStore((s) => s.setPendingGame);
  const excluded = excludeIds?.join(",") ?? exclude ?? "";
  const excludedIds = useMemo(
    () => new Set(excluded.split(",").filter(Boolean).map(Number)),
    [excluded],
  );
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [search, setSearch] = useState(true);
  const [collection, setCollection] = useState(true);
  const selected = useRef(false);
  const account = useBggAccount({
    apiUrl: apiUrl(),
    getToken,
    userId,
    enabled: isLoaded && isSignedIn,
  });
  const hasCollection = Boolean(account.account.data?.active);
  const pickerOptions = {
    apiUrl: apiUrl(),
    getToken,
    userId,
    query: debounced,
    search,
    collection: collection && hasCollection,
    snapshot: account.account.data?.active?.snapshot,
  };
  const picker = useBggPicker(pickerOptions);
  const scope = hashKey(bggPickerQuery(pickerOptions).queryKey);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const scrolledScope = useRef<string | null>(null);
  const [visibleWindow, setVisibleWindow] = useState({ scope, chunks: 1 });
  // Reset before committing a different owner/snapshot/filter, never paint its old budget.
  if (visibleWindow.scope !== scope) {
    scrolledScope.current = null;
    setVisibleWindow({ scope, chunks: 1 });
  }
  const visibleChunks = visibleWindow.scope === scope ? visibleWindow.chunks : 1;
  const { items, hasCachedMore } = useMemo(
    () => gamePickerWindow(picker.data?.pages, visibleChunks, excludedIds),
    [picker.data?.pages, visibleChunks, excludedIds],
  );
  const { hasNextPage, isFetching, isError, fetchNextPage } = picker;
  const hasMore = hasCachedMore || hasNextPage;
  const loadMore = useCallback(() => {
    if (scopeRef.current !== scope) return;
    if (!hasCachedMore && (!hasNextPage || isFetching || isError)) return;
    // Duplicate callbacks from one committed viewport expose at most one additional chunk.
    setVisibleWindow((current) =>
      current.scope === scope && current.chunks < visibleChunks + 1
        ? { scope, chunks: visibleChunks + 1 }
        : current,
    );
    if (!hasCachedMore) void fetchNextPage({ cancelRefetch: false });
  }, [scope, hasCachedMore, hasNextPage, isFetching, isError, fetchNextPage, visibleChunks]);
  const beginScroll = useCallback(() => {
    if (scopeRef.current === scope) scrolledScope.current = scope;
  }, [scope]);
  const endReached = useCallback(() => {
    // A short initial viewport can fire onEndReached before any user scroll.
    if (scrolledScope.current === scope) loadMore();
  }, [scope, loadMore]);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const active = (search && debounced.length >= 4) || (collection && hasCollection);

  const select = useCallback(
    (item: BggPickerItem) => {
      if (scopeRef.current !== scope || selected.current || excludedIds.has(item.id)) return;
      selected.current = true;
      if (onSelect) onSelect(item);
      else {
        setPendingGame(slotId, {
          id: item.id,
          name: item.name,
          imageUrl: item.imageUrl,
          year: item.year,
          average: item.average,
          rank: item.rank,
        });
        router.back();
      }
    },
    [scope, excludedIds, onSelect, setPendingGame, slotId, router],
  );
  const selectLabel = t("Select");
  const renderItem = useCallback(
    ({ item }: { item: BggPickerItem }) => (
      <GamePickerRow
        item={item}
        onSelect={select}
        selectLabel={selectLabel}
        accentForeground={accentForeground}
      />
    ),
    [select, selectLabel, accentForeground],
  );

  return (
    <FlatList
      key={scope}
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={items}
      keyExtractor={gameKey}
      initialNumToRender={GAME_PICKER_CHUNK_SIZE}
      maxToRenderPerBatch={6}
      windowSize={7}
      onScrollBeginDrag={beginScroll}
      onEndReachedThreshold={0.4}
      onEndReached={endReached}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          {onClose ? (
            <Stack.Screen
              options={{
                title: t("Choose a game"),
                headerBackVisible: false,
                headerLeft: () => <HeaderBackButton onPress={onClose} />,
              }}
            />
          ) : null}
          <SearchHelpLabel
            label={t("Search board games")}
            help={t("Type at least 4 characters to search")}
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            label={t("Search board games")}
            placeholder={t("Search board games")}
            testID="game-search-input"
          />
          <FilterChips
            options={[
              { key: "search", label: t("Search"), icon: Search },
              ...(hasCollection
                ? [{ key: "collection" as const, label: t("Collection"), icon: LibraryBig }]
                : []),
            ]}
            selected={[
              ...(search ? ["search" as const] : []),
              ...(collection ? ["collection" as const] : []),
            ]}
            onToggle={(key) => {
              if (key === "search") setSearch((value) => !value);
              else setCollection((value) => !value);
            }}
          />
          {picker.isError || account.account.isError ? (
            <Button
              variant="outline"
              onPress={() => {
                void account.account.refetch();
                void picker.refetch();
              }}
            >
              <Typography>{t("Search failed. Retry")}</Typography>
            </Button>
          ) : null}
          {active && picker.isPending ? (
            <View style={{ gap: 8 }}>
              <Skeleton
                isLoading
                variant="pulse"
                style={{ width: "100%", height: 48, borderRadius: 12 }}
              />
              <Skeleton
                isLoading
                variant="pulse"
                style={{ width: "100%", height: 48, borderRadius: 12 }}
              />
            </View>
          ) : null}
          {active && !picker.isPending && !picker.isError && !hasMore && items.length === 0 ? (
            <EmptyList icon={<Gamepad2 size={28} color={muted} />}>{t("No games found")}</EmptyList>
          ) : null}
          {active && !picker.isPending && items.length === 0 && hasMore ? (
            <Button onPress={loadMore} isDisabled={!hasCachedMore && (isFetching || isError)}>
              <Button.Label>{t("Load more games")}</Button.Label>
            </Button>
          ) : null}
        </View>
      }
      ListFooterComponent={
        picker.isFetchingNextPage ? (
          <Skeleton
            isLoading
            variant="pulse"
            style={{ width: "100%", height: 48, borderRadius: 12 }}
          />
        ) : hasMore && items.length > 0 ? (
          <Button onPress={loadMore} isDisabled={!hasCachedMore && (isFetching || isError)}>
            <Button.Label>{t("Load more games")}</Button.Label>
          </Button>
        ) : null
      }
      renderItem={renderItem}
    />
  );
}

const gameKey = (item: BggPickerItem) => String(item.id);
const GamePickerRow = memo(function GamePickerRow({
  item,
  onSelect,
  selectLabel,
  accentForeground,
}: {
  item: BggPickerItem;
  onSelect: (item: BggPickerItem) => void;
  selectLabel: string;
  accentForeground: string;
}) {
  return (
    <GroupedList>
      <GameListRow
        name={item.name}
        imageUrl={item.imageUrl}
        year={item.year}
        average={item.average}
        rank={item.rank}
        actions={
          <Button
            isIconOnly
            size="sm"
            style={{ minWidth: 44, minHeight: 44 }}
            accessibilityLabel={`${selectLabel}: ${item.name}`}
            onPress={() => onSelect(item)}
          >
            <Plus size={16} color={accentForeground} />
          </Button>
        }
      />
    </GroupedList>
  );
});
