import type { MatchGameRating } from "@board-game-organizer/schemas";
import type { ScorePlayer } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";

import { ListOrdered, Trophy } from "lucide-react";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
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
  const { t } = useLingui();
  return (
    <>
      <UserAvatar
        name={player.name || "?"}
        avatarUrl={player.avatarUrl}
        badge={
          rank != null ? (
            <IconBadge
              icon={rank === 1 ? Trophy : ListOrdered}
              label={`${t`Position`}: #${rank}`}
              title={t`Position`}
              color={rank === 1 ? "success" : "default"}
            >
              <p>#{rank}</p>
            </IconBadge>
          ) : undefined
        }
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{player.name}</span>
        {rank != null ? (
          <span className="block text-xs text-muted">{`${t`Position`}: #${rank}`}</span>
        ) : null}
        {showGameRating ? (
          <GameRating rating={gameRating} showDelta />
        ) : (
          <span className="block truncate text-xs text-muted">
            {player.username ?? t`Username unavailable`}
          </span>
        )}
      </span>
    </>
  );
}
