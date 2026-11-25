import {
  type ClientGroupRecord,
  communityAccessDenied,
  usePublicGroupSearch,
} from "@board-game-organizer/shared";
import * as Location from "expo-location";
import { useFocusEffect, useNavigation } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { LocateFixed, Search, SearchX, UsersRound } from "lucide-react-native";
import { useCallback, useLayoutEffect, useRef } from "react";
import { BackHandler, type FlatList, Keyboard, Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderBackButton } from "@/components/common/layout/HeaderBackButton";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { ListPage, listPageContentStyle } from "@/components/common/ui/ListPage";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useT } from "@/lib/i18n";
import { requestUserPosition } from "@/lib/locations/user-location";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { GroupCard } from "./GroupCard";
import { GroupSearchDistance } from "./GroupSearchDistance";

async function requestNearbyPosition() {
  const position = await requestUserPosition(Location, Linking.openSettings, () => {});
  return position?.coords ?? null;
}

function renderGroup({ item }: { item: ClientGroupRecord }) {
  return <GroupCard group={item} />;
}

export function GroupSearch({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const t = useT();
  const options = useCommunityApi();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const layout = useFloatingActionLayout(false);
  const muted = useThemeColor("muted");
  const listRef = useRef<FlatList<ClientGroupRecord>>(null);
  const {
    query,
    setQuery,
    active,
    open,
    close,
    friends,
    toggleFriends,
    nearby,
    radiusKm,
    setRadiusKm,
    toggleNearby,
    locating,
    locationError,
    list,
  } = usePublicGroupSearch(options, requestNearbyPosition);
  const items = communityAccessDenied(list.error) ? [] : list.items;

  useLayoutEffect(() => {
    if (!active) return;
    navigation.setOptions({ headerShown: false });
    onActiveChange(true);
    return () => {
      navigation.setOptions({ headerShown: true });
      onActiveChange(false);
    };
  }, [active, navigation, onActiveChange]);

  const scrollToStart = () => listRef.current?.scrollToOffset({ offset: 0, animated: false });
  const finish = useCallback(() => {
    Keyboard.dismiss();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    close();
  }, [close]);
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        finish();
        return true;
      });
      return () => subscription.remove();
    }, [active, finish]),
  );

  const setSearchText = (value: string) => {
    scrollToStart();
    setQuery(value);
  };
  const filter = (key: "friends" | "nearby") => {
    open();
    scrollToStart();
    if (key === "friends") toggleFriends();
    else void toggleNearby();
  };
  const selected: Array<"friends" | "nearby"> = [];
  if (friends) selected.push("friends");
  if (nearby) selected.push("nearby");
  const firstPageError = list.isError && !list.isFetchNextPageError;

  return (
    <NotificationAttentionScope
      options={options}
      targets={items.map((row) => ({ kind: "group", id: row.id }))}
    >
      <ListPage>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: active ? insets.top + 4 : 8,
            gap: 8,
          }}
        >
          {!active ? (
            <HelpSectionCard title={t("Group search")} label={t("Group search help")} icon={Search}>
              <Typography className="text-foreground">
                {t(
                  "Search approved public groups by name or venue address. Use the filters to find nearby groups or groups with friends.",
                )}
              </Typography>
            </HelpSectionCard>
          ) : null}
          {/* The input remains mounted during the layout change so focus and keyboard stay intact. */}
          <SearchInput
            value={query}
            onChange={setSearchText}
            label={t("Search groups")}
            placeholder={t("Search groups")}
            testID="list-search-input"
            maxLength={120}
            onFocus={open}
            leadingAction={active ? <HeaderBackButton onPress={finish} /> : undefined}
            inputStyle={active ? { flex: 1 } : undefined}
          />
          <FilterChips
            options={[
              { key: "friends", label: t("Friends"), icon: UsersRound },
              { key: "nearby", label: t("Near me"), icon: LocateFixed },
            ]}
            selected={selected}
            onToggle={filter}
          >
            {nearby ? (
              <GroupSearchDistance
                radiusKm={radiusKm}
                onChange={(value) => {
                  scrollToStart();
                  setRadiusKm(value);
                }}
              />
            ) : null}
          </FilterChips>
          {locating ? (
            <Skeleton
              accessibilityLabel={t("Loading…")}
              style={{ width: 104, height: 8, borderRadius: 4 }}
            />
          ) : null}
          {locationError ? (
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Location unavailable")}
            </Typography>
          ) : null}
        </View>
        <InputFlatList
          ref={listRef}
          testID="groups-scroll"
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(row) => row.id}
          contentContainerStyle={{
            ...listPageContentStyle,
            paddingTop: 4,
            paddingBottom: layout.paddingBottom,
          }}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
              void list.fetchNextPage();
          }}
          renderItem={renderGroup}
          ListEmptyComponent={
            list.isPending ? (
              <View style={{ gap: 12 }}>
                {[1, 2, 3].map((key) => (
                  <Skeleton key={key} style={{ width: "100%", height: 96, borderRadius: 12 }} />
                ))}
              </View>
            ) : !list.isError && !list.hasNextPage ? (
              <EmptyList icon={<SearchX size={28} color={muted} />}>
                {friends && !query.trim() && !nearby
                  ? t("No public groups with your friends")
                  : t("No groups found")}
              </EmptyList>
            ) : null
          }
          ListFooterComponent={
            firstPageError ? (
              <View style={{ gap: 8 }}>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load groups")}
                </Typography>
                <Button variant="outline" onPress={() => void list.refetch()}>
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              </View>
            ) : list.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ) : list.hasNextPage ? (
              <Button variant="outline" onPress={() => void list.fetchNextPage()}>
                <Button.Label>
                  {list.isFetchNextPageError ? t("Could not load groups. Retry") : t("Load more")}
                </Button.Label>
              </Button>
            ) : null
          }
        />
      </ListPage>
    </NotificationAttentionScope>
  );
}
