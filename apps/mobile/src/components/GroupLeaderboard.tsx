import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import { resolveApiUrl, useGroupLeaderboard } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import Constants from "expo-constants";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Clock3, Gamepad2, X } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Image, View } from "react-native";
import { useT } from "@/lib/i18n";
import { useSessionAuth } from "@/lib/useSessionAuth";

function GameCover({ imageUrl }: { imageUrl: string | null }) {
  return imageUrl ? (
    <Image
      accessible={false}
      source={{ uri: imageUrl }}
      style={{ width: 20, height: 24, borderRadius: 4 }}
    />
  ) : (
    <View style={{ width: 20, height: 24, alignItems: "center", justifyContent: "center" }}>
      <Gamepad2 size={16} color="#737373" />
    </View>
  );
}

export function GroupLeaderboard({ groupId }: { groupId: string }) {
  const { getToken, userId } = useSessionAuth();
  const t = useT();
  const { i18n } = useLingui();
  const format = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const [gameId, setGameId] = useState<number | null>(null);
  const { games, players } = useGroupLeaderboard({
    apiUrl: resolveApiUrl(Constants.expoConfig?.extra?.apiUrl as string | undefined),
    getToken,
    userId,
    groupId,
    gameId,
  });
  const choices = games.data?.games ?? [];
  const selected = choices.find((game) => game.id === gameId);
  const rows = players.data?.pages.flatMap((page) => page.players) ?? [];
  const retry = () => void (games.isError ? games.refetch() : players.refetch());

  if (games.isPending) return <Skeleton style={{ width: "100%", height: 60, borderRadius: 12 }} />;
  if (games.isError)
    return (
      <Button variant="ghost" onPress={retry}>
        <Typography>{t("Could not load leaderboards. Retry")}</Typography>
      </Button>
    );
  if (!choices.length)
    return (
      <Typography className="text-muted">{t("No matches played in this group yet")}</Typography>
    );

  return (
    <View style={{ flex: 1 }}>
      <Typography className="mb-2 font-medium text-foreground">{t("Board game")}</Typography>
      <View style={{ position: "relative" }}>
        <Select
          key={gameId ?? "none"}
          style={{ width: "100%" }}
          value={selected ? { value: String(selected.id), label: selected.name } : undefined}
          onValueChange={(value) => setGameId(value ? Number(value.value) : null)}
        >
          <Select.Trigger
            accessibilityLabel={t("Board game")}
            style={selected ? { paddingRight: 52 } : undefined}
          >
            {selected ? <GameCover imageUrl={selected.imageUrl} /> : null}
            <Select.Value style={{ flex: 1 }} placeholder={t("Select a board game")} />
            {!selected ? <Select.TriggerIndicator /> : null}
          </Select.Trigger>
          <Select.Portal>
            <Select.Overlay />
            <Select.Content presentation="popover">
              {choices.map((game) => (
                <Select.Item key={game.id} value={String(game.id)} label={game.name}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <GameCover imageUrl={game.imageUrl} />
                    <Select.ItemLabel />
                  </View>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Portal>
        </Select>
        {selected ? (
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("Clear board game selection")}
            style={{ position: "absolute", right: 2, bottom: 2, width: 44, height: 44 }}
            onPress={() => setGameId(null)}
          >
            <X size={18} color="#737373" />
          </Button>
        ) : null}
      </View>
      {gameId !== null ? (
        players.isPending ? (
          <Skeleton style={{ width: "100%", height: 130, borderRadius: 12, marginTop: 16 }} />
        ) : players.isError && !players.data ? (
          <Button variant="ghost" onPress={retry}>
            <Typography>{t("Could not load leaderboards. Retry")}</Typography>
          </Button>
        ) : (
          <FlatList
            style={{ flex: 1, marginTop: 16 }}
            data={rows}
            keyExtractor={(item) => item.userId}
            onEndReached={() => {
              if (
                players.hasNextPage &&
                !players.isFetchingNextPage &&
                !players.isFetchNextPageError
              )
                void players.fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              players.isFetchNextPageError ? (
                <Button variant="ghost" onPress={() => void players.fetchNextPage()}>
                  <Typography>{t("Could not load leaderboards. Retry")}</Typography>
                </Button>
              ) : players.isFetchingNextPage ? (
                <Skeleton style={{ width: "100%", height: 48, borderRadius: 12 }} />
              ) : null
            }
            contentContainerStyle={{ gap: 8, paddingBottom: 110 }}
            renderItem={({ item }) => <PlayerRow player={item} t={t} format={format} />}
          />
        )
      ) : null}
    </View>
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
  return (
    <View
      className="rounded-xl bg-surface p-3"
      style={{ opacity: player.left ? 0.55 : 1, gap: 10 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar size="md">
          {player.avatarUrl ? <Avatar.Image source={{ uri: player.avatarUrl }} /> : null}
          <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
        </Avatar>
        <View style={{ flex: 1 }}>
          <Typography className="font-medium text-foreground" numberOfLines={1}>
            {player.name}
          </Typography>
          <Typography className="text-sm text-muted" numberOfLines={1}>
            {player.username ? `@${player.username}` : "—"}
          </Typography>
          {player.left ? (
            <Typography className="text-sm text-foreground">{t("Former group member")}</Typography>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Stat label={t("Games played")} value={String(player.gamesPlayed)} />
        <Stat label={t("Games won")} value={String(player.gamesWon)} />
        <Stat label={t("ND")} value={String(player.nd)} />
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
                <Clock3 size={16} color="#f5a524" />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Typography className="text-xs text-muted">{label}</Typography>
      <Typography className="font-medium text-foreground">{value}</Typography>
    </View>
  );
}
