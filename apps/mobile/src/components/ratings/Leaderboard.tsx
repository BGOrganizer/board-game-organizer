import type {
  GroupLeaderboardResponse,
  LeaderboardDirection,
  LeaderboardSort,
} from "@board-game-organizer/schemas";
import { communityAccessDenied, resolveApiUrl, useLeaderboard } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import Constants from "expo-constants";
import { Button } from "heroui-native/button";
import { Card } from "heroui-native/card";
import { useThemeColor } from "heroui-native/hooks";
import { Menu } from "heroui-native/menu";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  ArrowDown,
  ArrowUp,
  ChartNoAxesColumnIncreasing,
  Dices,
  Medal,
  Trophy,
  UserRoundX,
} from "lucide-react-native";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, type ListRenderItemInfo, View } from "react-native";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { useT } from "@/lib/i18n";
import { useListActivity } from "@/lib/listActivity";
import { useSessionAuth } from "@/lib/useSessionAuth";
import { LeaderboardPlayerCard } from "./LeaderboardPlayerCard";
import { RatingGameSelect } from "./RatingGameSelect";

type Player = GroupLeaderboardResponse["players"][number];

const apiUrl = resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined);
const metrics = ["gamesPlayed", "gamesWon", "nd", "rating"] as const;
const compactFace = {
  height: 28,
  borderRadius: 8,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  gap: 4,
} as const;

export function Leaderboard({
  groupId,
  groupName,
  header,
}: {
  groupId?: string;
  groupName?: string;
  header?: ReactNode;
}) {
  const isActive = useListActivity();
  const { getToken, userId } = useSessionAuth();
  const t = useT();
  const [muted, foreground, iconAccent, accent, warning] = useThemeColor([
    "muted",
    "foreground",
    "accent-soft-foreground",
    "accent",
    "warning",
  ]);
  const { i18n } = useLingui();
  const format = useMemo(
    () =>
      new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [i18n.locale],
  );
  const [sort, setSort] = useState<LeaderboardSort>("rating");
  const [direction, setDirection] = useState<LeaderboardDirection>("desc");
  const [gameId, setGameId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const { games, players } = useLeaderboard({
    apiUrl,
    getToken,
    userId,
    groupId: groupId ?? null,
    gameId,
    sort,
    direction,
    query: debouncedSearch,
  });
  const choices = games.data?.games ?? [];
  const filteredChoices =
    debouncedSearch.length >= 4
      ? choices.filter((game) =>
          game.name
            .toLocaleLowerCase(i18n.locale)
            .includes(debouncedSearch.toLocaleLowerCase(i18n.locale)),
        )
      : choices;
  const selected = choices.find((game) => game.id === gameId) ?? games.selectedGame;
  const scope = JSON.stringify([apiUrl, userId, groupId, gameId, sort, direction]);
  const firstPage = players.data?.pages[0];
  const [window, setWindow] = useState({ scope, firstPage, pages: 1 });
  const count = window.scope === scope && window.firstPage === firstPage ? window.pages : 1;
  const pages = players.data?.pages;
  const rows = useMemo(
    () => pages?.slice(0, count).flatMap((page) => page.players) ?? [],
    [pages, count],
  );
  const current = useRef({
    scope,
    firstPage,
    active: false,
    epoch: 0,
    count,
  });
  if (current.current.scope !== scope || current.current.firstPage !== firstPage)
    current.current = { scope, firstPage, active: false, epoch: 0, count };
  const generation = current.current;
  generation.count = count;
  const activation = generation.epoch;
  const fetching = useRef<string | null>(null);
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    generation.active = true;
    return () => {
      generation.active = false;
      generation.epoch++;
      scrolled.current = null;
      fetching.current = null;
      if (current.current === generation) setWindow({ scope, firstPage, pages: 1 });
    };
  }, [generation, scope, firstPage]);
  const morePlayers = async (retryFailed = false) => {
    if (
      !isActive() ||
      current.current !== generation ||
      !generation.active ||
      generation.epoch !== activation ||
      generation.count !== count ||
      (!retryFailed && scrolled.current !== scope) ||
      fetching.current === scope ||
      players.isFetching
    )
      return;
    if ((pages?.length ?? 0) > count) {
      setWindow((old) =>
        old.scope === scope && old.firstPage === firstPage && old.pages >= count + 1
          ? old
          : { scope, firstPage, pages: count + 1 },
      );
      return;
    }
    if (!players.hasNextPage || (!retryFailed && players.isFetchNextPageError)) return;
    fetching.current = scope;
    try {
      const result = await players.fetchNextPage({ cancelRefetch: false });
      if (
        current.current === generation &&
        generation.active &&
        generation.epoch === activation &&
        !result.isError
      )
        setWindow({ scope, firstPage, pages: count + 1 });
    } finally {
      if (current.current === generation && generation.epoch === activation)
        fetching.current = null;
    }
  };
  const retry = () => void (games.isError ? games.refetch() : players.refetch());

  const metricLabels = {
    rating: {
      label: "OpenSkill",
      short: "OpenSkill",
      icon: ChartNoAxesColumnIncreasing,
      color: accent,
    },
    gamesPlayed: { label: t("Games played"), short: t("Played"), icon: Dices, color: muted },
    gamesWon: { label: t("Games won"), short: t("Wins"), icon: Trophy, color: warning },
    nd: { label: t("ND"), short: t("ND"), icon: UserRoundX, color: muted },
  };
  const CurrentIcon = metricLabels[sort].icon;
  const OrderIcon = direction === "asc" ? ArrowUp : ArrowDown;
  const changeSort = (metric: LeaderboardSort, order: LeaderboardDirection) => {
    setSort(metric);
    setDirection(order);
  };
  const renderPlayer = useCallback(
    ({ item }: ListRenderItemInfo<Player>) => (
      <LeaderboardPlayerCard player={item} group={Boolean(groupId)} format={format} />
    ),
    [format, groupId],
  );
  const hasGames = choices.length > 0 || debouncedSearch.length > 0;
  const hasErrors =
    games.isError || (players.isError && (!players.data || communityAccessDenied(players.error)));

  return (
    <FlatList
      style={{ flex: 1 }}
      data={gameId === null || hasErrors ? [] : rows}
      keyExtractor={(item) => item.userId}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={7}
      onScrollBeginDrag={() => {
        if (isActive()) scrolled.current = scope;
      }}
      onEndReached={() => void morePlayers()}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          {header === undefined || header === null || header === false ? null : (
            <View>{header}</View>
          )}
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10 }}>
            <View
              className="bg-accent-soft"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Medal size={20} color={iconAccent} accessible={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Card.Title accessibilityRole="header">{t("Rankings")}</Card.Title>
              <Card.Description>{groupId ? groupName : t("Global")}</Card.Description>
            </View>
            <HelpPopover
              label={t("How OpenSkill works")}
              title={t("How OpenSkill works")}
              size="compact"
              align="end"
            >
              <View style={{ gap: 8 }}>
                <Typography className="text-sm text-foreground">
                  {t(
                    "OpenSkill estimates your skill separately for each game. After a rated match, it uses your finish and the other players’ ratings to update your score. The displayed score accounts for uncertainty, which decreases as you play.",
                  )}
                </Typography>
                <Typography className="text-sm text-foreground">
                  {t(
                    "The clock marks a provisional rating until you have five rated results. ND means you did not finish and is counted separately from completed games.",
                  )}
                </Typography>
                <Typography className="text-sm text-foreground">
                  {groupId
                    ? t("This ranking uses rated results from this group.")
                    : t(
                        "The global ranking combines rated results across Board Game Organizer. It shows totals and ratings without revealing individual results or private groups.",
                      )}
                </Typography>
              </View>
            </HelpPopover>
          </Card>
          {games.isPending ? (
            <Skeleton style={{ width: "100%", height: 60, borderRadius: 12 }} />
          ) : games.isError ? (
            <Button variant="ghost" onPress={retry}>
              <Typography>{t("Could not load leaderboards. Retry")}</Typography>
            </Button>
          ) : !hasGames ? (
            <EmptyList icon={<Dices size={28} color={muted} />}>
              {groupId
                ? t("No rated tables played in this group yet")
                : t("No rated tables played yet")}
            </EmptyList>
          ) : (
            <RatingGameSelect
              selectedId={gameId}
              value={selected}
              games={filteredChoices}
              onChange={setGameId}
              onClose={() => {
                setSearch("");
                setDebouncedSearch("");
              }}
              onEndReached={() => {
                if (
                  games.hasNextPage &&
                  !games.isPlaceholderData &&
                  !games.isFetchingNextPage &&
                  !games.isFetchNextPageError
                )
                  void games.fetchNextPage();
              }}
              footer={
                games.hasNextPage ? (
                  <Button
                    variant="secondary"
                    isDisabled={games.isFetchingNextPage || games.isPlaceholderData}
                    onPress={() => void games.fetchNextPage()}
                  >
                    <Button.Label>{t("Load more games")}</Button.Label>
                  </Button>
                ) : undefined
              }
              empty={
                games.isPlaceholderData ? (
                  <Skeleton style={{ width: "100%", height: 44, borderRadius: 8 }} />
                ) : (
                  <Typography className="text-muted">{t("No games found")}</Typography>
                )
              }
            >
              <SearchInput
                value={search}
                onChange={setSearch}
                label={t("Search board games")}
                placeholder={t("Search board games")}
              />
              <SearchHelpLabel
                label={t("Search board games")}
                help={t("Type at least 4 characters to search")}
              />
            </RatingGameSelect>
          )}
          {gameId !== null && !games.isError && hasGames ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                columnGap: 8,
              }}
            >
              <Typography className="text-sm text-muted">{t("Sort by")}</Typography>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Menu>
                  <Menu.Trigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      testID="ranking-sort-metric"
                      accessibilityLabel={`${t("Sort by")} ${metricLabels[sort].label}`}
                      style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 0 }}
                    >
                      <View
                        className="bg-surface-secondary"
                        style={{ ...compactFace, paddingHorizontal: 8 }}
                      >
                        <CurrentIcon
                          size={14}
                          color={metricLabels[sort].color}
                          accessible={false}
                        />
                        <Typography className="text-xs text-foreground">
                          {metricLabels[sort].short}
                        </Typography>
                      </View>
                    </Button>
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Overlay />
                    <Menu.Content presentation="popover" placement="bottom" align="end" width={220}>
                      <Menu.Group
                        selectionMode="single"
                        disallowEmptySelection
                        selectedKeys={[sort]}
                        onSelectionChange={(keys) => {
                          const selected = metrics.find((metric) => keys.has(metric));
                          if (selected) changeSort(selected, direction);
                        }}
                      >
                        {metrics.map((metric) => {
                          const { icon: Icon, color, label } = metricLabels[metric];
                          return (
                            <Menu.Item key={metric} id={metric} accessibilityLabel={label}>
                              <Icon size={16} color={color} accessible={false} />
                              <Menu.ItemTitle>{label}</Menu.ItemTitle>
                              <Menu.ItemIndicator />
                            </Menu.Item>
                          );
                        })}
                      </Menu.Group>
                    </Menu.Content>
                  </Menu.Portal>
                </Menu>
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  testID="ranking-sort-direction"
                  accessibilityLabel={
                    direction === "asc" ? t("Sort descending") : t("Sort ascending")
                  }
                  onPress={() => changeSort(sort, direction === "asc" ? "desc" : "asc")}
                  style={{ width: 44, minHeight: 44, padding: 0 }}
                >
                  <View className="bg-surface-secondary" style={{ ...compactFace, width: 28 }}>
                    <OrderIcon size={14} color={foreground} accessible={false} />
                  </View>
                </Button>
              </View>
            </View>
          ) : null}
          {gameId !== null &&
          !games.isError &&
          players.isError &&
          (!players.data || communityAccessDenied(players.error)) ? (
            <Button variant="ghost" onPress={retry}>
              <Typography>{t("Could not load leaderboards. Retry")}</Typography>
            </Button>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        games.isPending || games.isError || !hasGames || hasErrors ? null : gameId === null ? (
          <EmptyList icon={<Dices size={28} color={muted} />}>
            {t("Choose a game to see the leaderboard")}
          </EmptyList>
        ) : players.isPending ? (
          <Skeleton style={{ width: "100%", height: 130, borderRadius: 12 }} />
        ) : (
          <EmptyList icon={<Medal size={28} color={muted} />}>
            {t("No leaderboard for this game yet")}
          </EmptyList>
        )
      }
      ListFooterComponent={
        players.isFetchNextPageError ? (
          <Button variant="ghost" onPress={() => void morePlayers(true)}>
            <Typography>{t("Could not load leaderboards. Retry")}</Typography>
          </Button>
        ) : players.isFetchingNextPage ? (
          <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
        ) : null
      }
      contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 8, paddingBottom: 110 }}
      renderItem={renderPlayer}
    />
  );
}
