import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { Avatar } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function MatchStandingIdentity({
  player,
  rank,
}: {
  player: MatchDetailResponse["administrator"];
  rank?: number | null;
}) {
  const { t } = useLingui();
  return (
    <>
      <span className="relative shrink-0">
        <Avatar size="sm" color="accent">
          <Avatar.Image src={player.avatarUrl ?? undefined} alt={player.name} />
          <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
        </Avatar>
        {rank != null && (
          <span className="absolute -right-0.5 -bottom-0.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-0.5 text-center text-[10px] leading-none font-bold text-accent-foreground ring-1 ring-surface">
            {rank}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{player.name}</span>
        <span className="block truncate text-xs text-default-500">
          {player.email ?? t`Email unavailable`}
        </span>
      </span>
    </>
  );
}
