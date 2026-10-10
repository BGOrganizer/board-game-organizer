import type { BggPickerItem, BggThingResponse } from "@board-game-organizer/schemas";
import {
  resolveApiUrl,
  useBggAccount,
  useBggPicker,
  withProtectionBypass,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import Constants from "expo-constants";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Gamepad2, LibraryBig, Plus, Search } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GameListRow } from "@/components/games/GameListRow";
import { useT } from "@/lib/i18n";
import { useSessionAuth } from "@/lib/useSessionAuth";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export default function GamePicker({
  onSelect,
  onClose,
}: {
  onSelect?: (game: BggThingResponse) => void;
  onClose?: () => void;
} = {}) {
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const t = useT();
  const muted = useThemeColor("muted");
  const router = useRouter();
  const { slotId, exclude } = useLocalSearchParams<{ slotId: string; exclude?: string }>();
  const setPendingGame = useAppStore((s) => s.setPendingGame);
  const excludedIds = useMemo(
    () =>
      new Set(
        (exclude ?? "")
          .split(",")
          .filter(Boolean)
          .map((id) => Number(id)),
      ),
    [exclude],
  );
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [search, setSearch] = useState(true);
  const [collection, setCollection] = useState(true);
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const account = useBggAccount({
    apiUrl: apiUrl(),
    getToken,
    userId,
    enabled: isLoaded && isSignedIn,
  });
  const hasCollection = Boolean(account.account.data?.active);
  const picker = useBggPicker({
    apiUrl: apiUrl(),
    getToken,
    userId,
    query: debounced,
    search,
    collection: collection && hasCollection,
    snapshot: account.account.data?.active?.snapshot,
  });
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const items = (picker.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (item) => !excludedIds.has(item.id),
  );
  const active = (search && debounced.length >= 4) || (collection && hasCollection);

  const select = async (item: BggPickerItem) => {
    setPicking(item.id);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("No session token");
      const response = await fetch(
        withProtectionBypass(`${apiUrl()}/api/bgg/thing?id=${item.id}`),
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const details = (await response.json()) as BggThingResponse;
      if (onSelect) {
        onSelect(details);
        return;
      }
      setPendingGame(slotId, {
        id: details.id,
        name: details.name,
        imageUrl: details.imageUrl,
        year: details.year,
        average: details.average,
        rank: details.rank,
      });
      router.back();
    } catch {
      setError(t("Could not load game details"));
    } finally {
      setPicking(null);
    }
  };

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={items}
      keyExtractor={(item) => String(item.id)}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (picker.hasNextPage && !picker.isFetchingNextPage) void picker.fetchNextPage();
      }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          {onClose ? (
            <Stack.Screen
              options={{
                title: t("Choose a game"),
                headerBackVisible: false,
                headerLeft: () => (
                  <Button variant="ghost" onPress={onClose}>
                    {t("Back")}
                  </Button>
                ),
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
          {error ? <Typography className="text-danger">{error}</Typography> : null}
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
          {active &&
          !picker.isPending &&
          !picker.isError &&
          !picker.hasNextPage &&
          items.length === 0 ? (
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
      renderItem={({ item }) => (
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
                accessibilityLabel={`${t("Select")}: ${item.name}`}
                isDisabled={picking === item.id}
                onPress={() => void select(item)}
              >
                <Plus size={16} color="#fff" />
              </Button>
            }
          />
        </GroupedList>
      )}
    />
  );
}
