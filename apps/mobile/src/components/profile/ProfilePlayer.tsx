import {
  communityAccessDenied,
  useProfileRating,
  useProfileRatingGames,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { ListCard } from "@/components/common/ui/ListCard";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileRatingChart } from "./ProfileRatingChart";
import { ProfileStats } from "./ProfileStats";

export function ProfilePlayer({ userId, viewKey }: { userId: string; viewKey: string }) {
  const t = useT(),
    { i18n } = useLingui(),
    o = useCommunityApi(),
    muted = useThemeColor("muted");
  const gameId = useAppStore((s) => s.profileViews[viewKey]?.gameId ?? null),
    setView = useAppStore((s) => s.setProfileView);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const games = useProfileRatingGames(o, userId, query),
    history = useProfileRating(o, userId, gameId);
  const choices = communityAccessDenied(games.error)
    ? []
    : (games.data?.pages.flatMap((p) => p.items) ?? []);
  const data =
    gameId === null || communityAccessDenied(games.error) || communityAccessDenied(history.error)
      ? undefined
      : history.data?.pages[0];
  const selected =
    gameId === null ? undefined : (choices.find((g) => g.id === gameId) ?? data?.game);
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const points = [...(history.data?.pages ?? [])].reverse().flatMap((p) => p.points);
  return (
    <View style={{ gap: 12 }}>
      <Typography accessibilityRole="header" className="font-semibold text-foreground">
        {t("OpenSkill statistics")}
      </Typography>
      <Select
        value={selected ? { value: String(selected.id), label: selected.name } : undefined}
        onValueChange={(v) => setView(viewKey, { gameId: v ? Number(v.value) : null })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Select.Trigger accessibilityLabel={t("Board game")} style={{ flex: 1 }}>
            <Typography className="text-foreground" style={{ flex: 1 }}>
              {selected?.name ?? t("Select a board game")}
            </Typography>
            <Select.TriggerIndicator />
          </Select.Trigger>
          {gameId !== null ? (
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              style={{ minWidth: 44, minHeight: 44 }}
              accessibilityLabel={t("Clear selected game")}
              onPress={() => setView(viewKey, { gameId: null })}
            >
              <X size={18} color={muted} accessible={false} />
            </Button>
          ) : null}
        </View>
        <Select.Portal>
          <Select.Overlay />
          <Select.Content presentation="popover" width="trigger">
            <SearchInput
              value={search}
              onChange={setSearch}
              label={t("Filter games")}
              placeholder={t("Filter games")}
            />
            <FlatList
              style={{ width: "100%", maxHeight: 280 }}
              data={choices}
              keyExtractor={(g) => String(g.id)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Select.Item value={String(item.id)} label={item.name}>
                  <Typography className="text-foreground">{item.name}</Typography>
                  <Select.ItemIndicator />
                </Select.Item>
              )}
              onEndReached={() => {
                if (games.hasNextPage && !games.isFetchingNextPage) void games.fetchNextPage();
              }}
              ListFooterComponent={
                games.isFetchingNextPage ? (
                  <Skeleton style={{ width: "100%", height: 44, borderRadius: 8 }} />
                ) : null
              }
              ListEmptyComponent={
                games.isPending ? (
                  <Skeleton style={{ width: "100%", height: 44, borderRadius: 8 }} />
                ) : games.isError ? null : (
                  <Typography className="text-muted">{t("No rated games yet")}</Typography>
                )
              }
            />
            {games.isError ? (
              <Button variant="secondary" onPress={() => void games.refetch()}>
                <Button.Label>{t("Try again")}</Button.Label>
              </Button>
            ) : null}
          </Select.Content>
        </Select.Portal>
      </Select>
      {games.isPending ? (
        <Skeleton style={{ width: "100%", height: 52, borderRadius: 12 }} />
      ) : null}
      {games.isError || (gameId !== null && history.isError) ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load rating history")}
          </Typography>
          <Button
            variant="secondary"
            onPress={() => {
              void games.refetch();
              if (gameId) void history.refetch();
            }}
          >
            <Button.Label>{t("Try again")}</Button.Label>
          </Button>
        </View>
      ) : null}
      {!choices.length && !games.isPending && !games.isError && !query ? (
        <Typography className="text-muted">{t("No rated games yet")}</Typography>
      ) : null}
      {gameId && history.isPending ? (
        <Skeleton style={{ width: "100%", height: 180, borderRadius: 12 }} />
      ) : null}
      {data ? (
        <>
          <ListCard>
            <View style={{ padding: 16, gap: 12 }}>
              <Typography className="font-semibold text-foreground">
                {t("Current rating")}:{" "}
                {data.rating === null ? t("Unknown") : number.format(data.rating)}
              </Typography>
              <Typography className="text-sm text-muted">
                {t("Last rated game change")}:{" "}
                {data.delta === null
                  ? "—"
                  : `${data.delta >= 0 ? "+" : ""}${number.format(data.delta)}`}
              </Typography>
              <ProfileRatingChart points={points} />
            </View>
          </ListCard>
          <ProfileStats
            items={[
              { label: t("Games played"), value: number.format(data.stats.gamesPlayed) },
              { label: t("Games won"), value: number.format(data.stats.gamesWon) },
            ]}
          />
          {history.hasNextPage ? (
            <Button
              variant="secondary"
              isDisabled={history.isFetchingNextPage}
              onPress={() => void history.fetchNextPage()}
            >
              <Button.Label>{t("Earlier rated games")}</Button.Label>
            </Button>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
