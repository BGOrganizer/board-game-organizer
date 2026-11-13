import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import {
  formatUsername,
  groupLeaderboardRoles,
  RECORD_USER_ROLES,
  resolveApiUrl,
  useGroupLeaderboard,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import Constants from "expo-constants";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Clock3, Dices } from "lucide-react-native";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { LeaderboardStat } from "@/components/ratings/LeaderboardStat";
import { RatingGameSelect } from "@/components/ratings/RatingGameSelect";
import { useT } from "@/lib/i18n";
import { useSessionAuth } from "@/lib/useSessionAuth";

export function GroupLeaderboard({ groupId, header }: { groupId: string; header?: ReactNode }) {
  const { getToken, userId } = useSessionAuth();
  const t = useT();
  const muted = useThemeColor("muted");
  const { i18n } = useLingui();
  const format = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const [gameId, setGameId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const { games, players } = useGroupLeaderboard({
    apiUrl: resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined),
    getToken,
    userId,
    groupId,
    gameId,
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
  const selected = choices.find((game) => game.id === gameId);
  const scope = JSON.stringify([Constants.expoConfig?.extra?.apiUrl, userId, groupId, gameId]);
  const firstPage = players.data?.pages[0];
  const [window, setWindow] = useState({ scope, firstPage, pages: 1 });
  const count = window.scope === scope && window.firstPage === firstPage ? window.pages : 1;
  const pages = players.data?.pages;
  const rows = useMemo(
    () => pages?.slice(0, count).flatMap((page) => page.players) ?? [],
    [pages, count],
  );
  const current = useRef<{ scope: string; firstPage: typeof firstPage } | null>({
    scope,
    firstPage,
  });
  current.current = { scope, firstPage };
  const fetching = useRef<string | null>(null);
  const scrolled = useRef<string | null>(null);
  useEffect(
    () => () => {
      current.current = null;
    },
    [],
  );
  const morePlayers = async () => {
    if (scrolled.current !== scope || fetching.current === scope || players.isFetching) return;
    if ((pages?.length ?? 0) > count) {
      setWindow((old) =>
        old.scope === scope && old.firstPage === firstPage && old.pages >= count + 1
          ? old
          : { scope, firstPage, pages: count + 1 },
      );
      return;
    }
    if (!players.hasNextPage || players.isFetchNextPageError) return;
    fetching.current = scope;
    try {
      const result = await players.fetchNextPage({ cancelRefetch: false });
      if (
        current.current?.scope === scope &&
        current.current.firstPage === firstPage &&
        !result.isError
      )
        setWindow({ scope, firstPage, pages: count + 1 });
    } finally {
      if (fetching.current === scope) fetching.current = null;
    }
  };
  const retry = () => void (games.isError ? games.refetch() : players.refetch());

  return (
    <FlatList
      style={{ flex: 1 }}
      data={gameId === null || games.isError || (players.isError && !players.data) ? [] : rows}
      keyExtractor={(item) => item.userId}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      windowSize={7}
      onScrollBeginDrag={() => {
        scrolled.current = scope;
      }}
      onEndReached={() => void morePlayers()}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          {header}
          {games.isPending ? (
            <Skeleton style={{ width: "100%", height: 60, borderRadius: 12 }} />
          ) : games.isError ? (
            <Button variant="ghost" onPress={retry}>
              <Typography>{t("Could not load leaderboards. Retry")}</Typography>
            </Button>
          ) : !choices.length && !debouncedSearch ? (
            <EmptyList icon={<Dices size={28} color={muted} />}>
              {t("No rated tables played in this group yet")}
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
          {gameId !== null && players.isError && !players.data ? (
            <Button variant="ghost" onPress={retry}>
              <Typography>{t("Could not load leaderboards. Retry")}</Typography>
            </Button>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        gameId !== null && players.isPending ? (
          <Skeleton style={{ width: "100%", height: 130, borderRadius: 12 }} />
        ) : null
      }
      ListFooterComponent={
        players.isFetchNextPageError ? (
          <Button
            variant="ghost"
            onPress={() => void players.fetchNextPage({ cancelRefetch: false })}
          >
            <Typography>{t("Could not load leaderboards. Retry")}</Typography>
          </Button>
        ) : players.isFetchingNextPage ? (
          <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
        ) : null
      }
      contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 16, paddingBottom: 110 }}
      renderItem={({ item }) => <PlayerRow player={item} t={t} format={format} />}
    />
  );
}

function PlayerRow({
  player,
  t,
  format,
}: {
  player: GroupLeaderboardResponse["players"][number];
  t: ReturnType<typeof useT>;
  format: Intl.NumberFormat;
}) {
  const warning = useThemeColor("warning");
  const name = formatUsername(player.username, t("Username unavailable"));
  const roles = groupLeaderboardRoles(player);
  const primary = roles[0];
  const secondary = player.left
    ? t("Former group member")
    : primary
      ? t(RECORD_USER_ROLES[primary].message)
      : null;
  return (
    <View
      testID={`group-ranking-player-${player.userId}`}
      className="rounded-xl bg-surface p-3"
      style={{ opacity: player.left ? 0.55 : 1, gap: 10 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <UserAvatar
          name={name}
          avatarUrl={player.avatarUrl}
          badgeContent={roles.length ? <UserRoleBadge roles={roles} /> : undefined}
        />
        <View style={{ flex: 1 }}>
          <Typography className="font-medium text-foreground" numberOfLines={1}>
            {name}
          </Typography>
          {secondary ? (
            <Typography className="text-sm text-muted" numberOfLines={1}>
              {secondary}
            </Typography>
          ) : null}
          {!player.left && player.groupRole === undefined ? (
            <Skeleton
              accessibilityLabel={t("Loading…")}
              style={{ width: 88, height: 16, borderRadius: 4 }}
            />
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <LeaderboardStat label={t("Games played")} value={String(player.gamesPlayed)} />
        <LeaderboardStat label={t("Games won")} value={String(player.gamesWon)} />
        <LeaderboardStat label={t("ND")} value={String(player.nd)} />
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Typography className="text-xs text-muted">{t("Ranking")}</Typography>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Typography className="font-medium text-foreground">
              {player.rating === null ? t("Not rated") : format.format(player.rating)}
            </Typography>
            {player.provisional ? (
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={t("Provisional rating")}
              >
                <Clock3 size={16} color={warning} />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
