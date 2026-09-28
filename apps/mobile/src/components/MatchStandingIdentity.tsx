import type { MatchDetailResponse, MatchGameRating } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react";
import { Avatar } from "heroui-native/avatar";
import { Typography } from "heroui-native/text";
import { ArrowDown, ArrowUp, ChartNoAxesCombined, Equal } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

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
  const { i18n } = useLingui();
  const format = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const delta = Number(gameRating?.delta.toFixed(2)) || 0;
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
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <View accessible accessibilityRole="image" accessibilityLabel={t("Game rating")}>
              <ChartNoAxesCombined size={14} color="#737373" />
            </View>
            <Typography className="text-xs text-muted">
              {gameRating ? format.format(gameRating.score) : t("Not rated")}
            </Typography>
            <View
              accessible
              accessibilityLabel={`${delta > 0 ? t("Rating increased") : delta < 0 ? t("Rating decreased") : t("Rating unchanged")}: ${delta > 0 ? "+" : ""}${format.format(delta)}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
            >
              {delta > 0 ? (
                <ArrowUp size={12} color="#17c964" />
              ) : delta < 0 ? (
                <ArrowDown size={12} color="#f31260" />
              ) : (
                <Equal size={12} color="#f5a524" />
              )}
              <Typography
                className={`text-xs ${delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-warning"}`}
              >
                {delta > 0 ? "+" : ""}
                {format.format(delta)}
              </Typography>
            </View>
          </View>
        ) : (
          <Typography className="text-xs text-muted" numberOfLines={1}>
            {player.email ?? t("Email unavailable")}
          </Typography>
        )}
      </View>
    </>
  );
}
