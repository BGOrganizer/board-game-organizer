import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { useMatchLeaderboard } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { ChartNoAxesCombined, Gamepad2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { EmptyList } from "@/components/EmptyList";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { GameRating, MatchStandingIdentity } from "@/components/MatchStandingIdentity";
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
              <Select.Value placeholder={t("Select a board game")} />
              <Select.TriggerIndicator />
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content presentation="popover" width="trigger">
                {games.map((game) => (
                  <Select.Item key={game.id} value={String(game.id)} label={game.name}>
                    <Typography className="text-foreground">{game.name}</Typography>
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
          <GroupedList>
            {leaderboard.data.ratings.map((rating) => {
              const player = participants.find((participant) => participant.id === rating.userId);
              return player ? (
                <GroupedRow key={rating.userId}>
                  <MatchStandingIdentity player={player} />
                  <GameRating rating={rating} />
                </GroupedRow>
              ) : null;
            })}
          </GroupedList>
        ))}
    </View>
  );
}
