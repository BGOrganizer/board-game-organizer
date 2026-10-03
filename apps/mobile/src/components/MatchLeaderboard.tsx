import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { useMatchLeaderboard } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Avatar } from "heroui-native/avatar";
import { Button } from "heroui-native/button";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { ChartNoAxesCombined, Clock3, Gamepad2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { EmptyList } from "@/components/EmptyList";
import { LeaderboardGameCover } from "@/components/LeaderboardGameCover";
import { LeaderboardStat } from "@/components/LeaderboardStat";
import { useT } from "@/lib/i18n";

export function MatchLeaderboard({
  data,
  apiUrl,
  token,
  getToken,
  userId,
}: {
  data: MatchDetailResponse;
  apiUrl: string;
  token: string | null;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const format = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const [selection, setSelection] = useState<number | null>(null);
  const { match, games } = data;
  const gameId =
    match.status === "PLANNING"
      ? games.some((game) => game.id === selection)
        ? selection
        : null
      : (match.selectedGameId ?? null);
  const selected = games.find((game) => game.id === gameId);
  const leaderboard = useMatchLeaderboard(
    { apiUrl, token, getToken, userId, matchId: match.id },
    gameId,
  );
  const participants = [
    data.administrator,
    ...data.invitedPlayers.filter((player) => player.invitation.status === "ACCEPTED"),
  ];

  return (
    <View style={{ gap: 12 }}>
      {match.status !== "PLANNING" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Gamepad2 size={18} color="#737373" />
          <Typography accessibilityRole="header" className="font-semibold text-foreground">
            {selected?.name ?? t("Board game")}
          </Typography>
        </View>
      )}
      {match.status === "PLANNING" && (
        <View style={{ gap: 8 }}>
          <Typography className="font-medium text-foreground">{t("Board game")}</Typography>
          <Select
            key={gameId ?? "none"}
            value={selected ? { value: String(selected.id), label: selected.name } : undefined}
            onValueChange={(value) => setSelection(value ? Number(value.value) : null)}
          >
            <Select.Trigger
              accessibilityLabel={
                selected ? `${t("Board game")}: ${selected.name}` : t("Board game")
              }
            >
              {selected ? <LeaderboardGameCover imageUrl={selected.thumbnail} /> : null}
              <Typography
                className={selected ? "text-foreground" : "text-muted"}
                style={{ flex: 1 }}
                numberOfLines={1}
              >
                {selected?.name ?? t("Select a board game")}
              </Typography>
              {!selected ? <Select.TriggerIndicator /> : null}
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content presentation="popover" width="trigger">
                {games.map((game) => (
                  <Select.Item key={game.id} value={String(game.id)} label={game.name}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <LeaderboardGameCover imageUrl={game.thumbnail} />
                      <Typography className="text-foreground" style={{ flex: 1 }} numberOfLines={1}>
                        {game.name}
                      </Typography>
                    </View>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Portal>
          </Select>
        </View>
      )}
      {gameId !== null &&
        (leaderboard.isPending ? (
          <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
        ) : leaderboard.isError ? (
          <Button variant="ghost" onPress={() => void leaderboard.refetch()}>
            <Typography>{t("Could not load leaderboards. Retry")}</Typography>
          </Button>
        ) : !leaderboard.data?.ratings.length ? (
          <EmptyList icon={<ChartNoAxesCombined size={28} color="#737373" />}>
            {t("No rankings available")}
          </EmptyList>
        ) : (
          <View style={{ gap: 8 }}>
            {leaderboard.data.ratings.map((rating) => {
              const player = participants.find((participant) => participant.id === rating.userId);
              return player ? (
                <View key={rating.userId} className="rounded-xl bg-surface p-3" style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Avatar size="md">
                      {player.avatarUrl ? (
                        <Avatar.Image source={{ uri: player.avatarUrl }} />
                      ) : null}
                      <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
                    </Avatar>
                    <View style={{ flex: 1 }}>
                      <Typography className="font-medium text-foreground" numberOfLines={1}>
                        {player.name}
                      </Typography>
                      <Typography className="text-sm text-muted" numberOfLines={1}>
                        {player.email ?? t("Email unavailable")}
                      </Typography>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <LeaderboardStat label={t("Games played")} value={String(rating.gamesPlayed)} />
                    <LeaderboardStat label={t("Games won")} value={String(rating.gamesWon)} />
                    <LeaderboardStat label={t("ND")} value={String(rating.nd)} />
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <Typography className="text-xs text-muted">{t("Ranking")}</Typography>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Typography className="font-medium text-foreground">
                          {format.format(rating.score)}
                        </Typography>
                        {rating.provisional ? (
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
              ) : null;
            })}
          </View>
        ))}
    </View>
  );
}
