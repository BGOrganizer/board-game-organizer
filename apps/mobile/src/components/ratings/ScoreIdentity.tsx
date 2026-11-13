import type { MatchGameRating } from "@board-game-organizer/schemas";
import type { ScorePlayer } from "@board-game-organizer/shared";

import { Typography } from "heroui-native/text";
import { ListOrdered, Trophy } from "lucide-react-native";
import { View } from "react-native";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { useT } from "@/lib/i18n";
import { GameRating } from "./GameRating";

export function ScoreIdentity({
  player,
  rank,
  gameRating,
  showGameRating = false,
}: {
  player: ScorePlayer;
  rank?: number | null;
  gameRating?: MatchGameRating;
  showGameRating?: boolean;
}) {
  const t = useT();
  return (
    <>
      <UserAvatar
        name={player.name || "?"}
        avatarUrl={player.avatarUrl}
        badgeContent={
          rank != null ? (
            <IconBadge
              icon={rank === 1 ? Trophy : ListOrdered}
              label={`${t("Position")}: #${rank}`}
              title={t("Position")}
              color={rank === 1 ? "success" : "default"}
            >
              <Typography className="text-foreground">#{rank}</Typography>
            </IconBadge>
          ) : undefined
        }
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Typography className="font-medium text-foreground" numberOfLines={1}>
          {player.name}
        </Typography>
        {rank != null ? (
          <Typography className="text-xs text-muted">{`${t("Position")}: #${rank}`}</Typography>
        ) : null}
        {showGameRating ? (
          <GameRating rating={gameRating} showDelta />
        ) : (
          <Typography className="text-xs text-muted" numberOfLines={1}>
            {player.username ?? t("Username unavailable")}
          </Typography>
        )}
      </View>
    </>
  );
}
