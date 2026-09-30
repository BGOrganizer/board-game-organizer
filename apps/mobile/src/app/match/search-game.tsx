import type { BggPickerItem, BggThingResponse } from "@board-game-organizer/schemas";
import {
  resolveApiUrl,
  useBggAccount,
  useBggPicker,
  withProtectionBypass,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { SearchField } from "heroui-native/search-field";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Gamepad2, LibraryBig, Plus, Search } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Image, View } from "react-native";
import { GameCatalogMetadata } from "@/components/GameCatalogMetadata";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { SearchHelpLabel } from "@/components/SearchHelpLabel";
import { useT } from "@/lib/i18n";
import { useSessionAuth } from "@/lib/useSessionAuth";

function apiUrl(): string {
  return resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
}

export default function SearchGameScreen() {
  const { getToken, isLoaded, isSignedIn, userId } = useSessionAuth();
  const t = useT();
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
          <SearchHelpLabel
            label={t("Search board games")}
            help={t("Type at least 4 characters to search")}
          />
          <SearchField value={query} onChange={setQuery}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input
                testID="game-search-input"
                accessibilityLabel={t("Search board games")}
                placeholder={t("Search board games")}
              />
              <SearchField.ClearButton accessibilityLabel={t("Clear")} />
            </SearchField.Group>
          </SearchField>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button
              size="sm"
              variant="primary"
              style={{
                minHeight: 32,
                height: 32,
                paddingHorizontal: 8,
                gap: 6,
                ...(!search && { backgroundColor: "#52525b" }),
              }}
              accessibilityLabel={t("Search")}
              accessibilityState={{ selected: search }}
              onPress={() => setSearch((value) => !value)}
            >
              <Search size={14} color="#fff" />
              <Typography className="text-white" style={{ fontSize: 12 }}>
                {t("Search")}
              </Typography>
            </Button>
            {hasCollection ? (
              <Button
                size="sm"
                variant="primary"
                style={{
                  minHeight: 32,
                  height: 32,
                  paddingHorizontal: 8,
                  gap: 6,
                  ...(!collection && { backgroundColor: "#52525b" }),
                }}
                accessibilityLabel={t("Collection")}
                accessibilityState={{ selected: collection }}
                onPress={() => setCollection((value) => !value)}
              >
                <LibraryBig size={14} color="#fff" />
                <Typography className="text-white" style={{ fontSize: 12 }}>
                  {t("Collection")}
                </Typography>
              </Button>
            ) : null}
          </View>
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
            <Typography className="text-muted">{t("No games found")}</Typography>
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
          <GroupedRow>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                backgroundColor: "#e5e7eb",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  accessible={false}
                  style={{ width: 40, height: 40, borderRadius: 8 }}
                />
              ) : (
                <Gamepad2 size={18} color="#6b7280" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Typography className="font-medium text-foreground" numberOfLines={1}>
                {item.name}
              </Typography>
              <GameCatalogMetadata year={item.year} average={item.average} rank={item.rank} />
            </View>
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
          </GroupedRow>
        </GroupedList>
      )}
    />
  );
}
