import type { BggPickerItem, BggThingResponse } from "@board-game-organizer/schemas";
import {
  type BggPickerTableScope,
  bggPickerQuery,
  bggPickerUnavailable,
  GAME_PICKER_CHUNK_SIZE,
  resolveApiUrl,
  useBggAccount,
  useBggPicker,
  useGameListWindow,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { hashKey } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Gamepad2, LibraryBig, Plus, UsersRound } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type FlatList, View } from "react-native";
import { HeaderBackButton } from "@/components/common/layout/HeaderBackButton";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GameListCard } from "@/components/games/GameListCard";
import { useT } from "@/lib/i18n";
import { useSessionAuth } from "@/lib/useSessionAuth";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export default function GamePicker({
  onSelect,
  onClose,
  excludeIds,
  proposalScope,
  tableScope,
}: {
  excludeIds?: readonly number[];
  proposalScope?: { eventId: string; tableId: string };
  tableScope?: BggPickerTableScope;
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
  const [collection, setCollection] = useState(true);
  const [participantSource, setParticipants] = useState(false);
  const selected = useRef(false);
  const list = useRef<FlatList<BggPickerItem>>(null);
  const account = useBggAccount({
    apiUrl: apiUrl(),
    getToken,
    userId,
    enabled: isLoaded && isSignedIn,
  });
  const hasCollection = Boolean(account.account.data?.active);
  const participants = participantSource && Boolean(tableScope);
  const search = !(collection && hasCollection) && !participants;
  const pickerOptions = {
    apiUrl: apiUrl(),
    getToken,
    userId,
    query: debounced,
    search,
    collection: collection && hasCollection,
    snapshot: account.account.data?.active?.snapshot,
    proposalScope,
    tableScope,
    participants,
  };
  const picker = useBggPicker(pickerOptions);
  const denied = bggPickerUnavailable(picker.error);
  const scope = hashKey([
    ...bggPickerQuery(pickerOptions).queryKey,
    picker.data?.pages[0]?.sourceEpoch,
    denied,
  ]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [scope]);
  const { items, hasMore, loadMore, beginScroll, endReached } = useGameListWindow({
    scope,
    pages: denied ? undefined : picker.data?.pages,
    excludedIds,
    ...picker,
  });
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const active = (search && debounced.length >= 4) || (collection && hasCollection) || participants;

  const select = useCallback(
    (item: BggPickerItem) => {
      if (scopeRef.current !== scope || denied || selected.current || excludedIds.has(item.id))
        return;
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
    [scope, denied, excludedIds, onSelect, setPendingGame, slotId, router],
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
    <InputFlatList
      ref={list}
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={items}
      keyExtractor={gameKey}
      initialNumToRender={GAME_PICKER_CHUNK_SIZE}
      maxToRenderPerBatch={6}
      windowSize={7}
      onScrollBeginDrag={beginScroll}
      onMomentumScrollBegin={beginScroll}
      accessibilityActions={
        hasMore ? [{ name: "increment", label: t("Load more games") }] : undefined
      }
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "increment") {
          beginScroll();
          loadMore();
        }
      }}
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
            help={t(
              "Choose collections to filter, or turn all collection filters off to search the catalog (at least 4 characters).",
            )}
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
              ...(hasCollection
                ? [{ key: "collection" as const, label: t("Collection"), icon: LibraryBig }]
                : []),
              ...(tableScope
                ? [
                    {
                      key: "participants" as const,
                      label: t("Participants' collections"),
                      icon: UsersRound,
                    },
                  ]
                : []),
            ]}
            selected={[
              ...(collection && hasCollection ? ["collection" as const] : []),
              ...(participants ? ["participants" as const] : []),
            ]}
            onToggle={(key) => {
              if (key === "participants") setParticipants((value) => !value);
              else setCollection((value) => !value);
            }}
          />
          {picker.isError || account.account.isError ? (
            <Button
              variant="outline"
              onPress={() => {
                if (account.account.isError) void account.account.refetch();
                if (picker.isError)
                  void (picker.isFetchNextPageError
                    ? picker.fetchNextPage({ cancelRefetch: false })
                    : picker.refetch());
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
        </View>
      }
      ListFooterComponent={
        picker.isFetchingNextPage ? (
          <Skeleton
            isLoading
            variant="pulse"
            style={{ width: "100%", height: 48, borderRadius: 12 }}
          />
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
    <GameListCard
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
  );
});
