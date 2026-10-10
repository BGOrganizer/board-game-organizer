import type { MatchDetailResponse, MatchGameRating } from "@board-game-organizer/schemas";

import { Avatar } from "heroui-native/avatar";
import { Typography } from "heroui-native/text";

import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { GameRating } from "./GameRating";

export function MatchStandingIdentity({
  player,
  rank,
  gameRating,
  showGameRating = false,
}: {
  player: MatchDetailResponse["administrator"];
  rank?: number | null;
  gameRating?: MatchGameRating;
  showGameRating?: boolean;
}) {
  const t = useT();
  return (
    <>
      <View style={{ width: 48, height: 48 }}>
        <Avatar size="md">
          {player.avatarUrl && <Avatar.Image source={{ uri: player.avatarUrl }} />}
          <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
        </Avatar>
        {rank != null && (
          <View
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              minWidth: 18,
              height: 18,
              paddingHorizontal: 1,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
            }}
            className="bg-accent"
          >
            <Typography
              className="font-bold text-accent-foreground"
              style={{
                fontSize: 10,
                lineHeight: 14,
                includeFontPadding: false,
                textAlign: "center",
              }}
            >
              {rank}
            </Typography>
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Typography className="font-medium text-foreground" numberOfLines={1}>
          {player.name}
        </Typography>
        {showGameRating ? (
          <GameRating rating={gameRating} showDelta />
        ) : (
          <Typography className="text-xs text-muted" numberOfLines={1}>
            {player.email ?? t("Email unavailable")}
          </Typography>
        )}
      </View>
    </>
  );
}
