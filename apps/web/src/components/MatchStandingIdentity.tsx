import type { MatchDetailResponse, MatchGameRating } from "@board-game-organizer/schemas";
import { Avatar } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ArrowUp, ChartNoAxesCombined, Equal } from "lucide-react";

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
  const { t, i18n } = useLingui();
  const format = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const delta = Number(gameRating?.delta.toFixed(2)) || 0;
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
        {showGameRating ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-default-500">
            <span role="img" aria-label={t`Game rating`}>
              <ChartNoAxesCombined className="size-3.5 shrink-0" aria-hidden="true" />
            </span>
            <span>{gameRating ? format.format(gameRating.score) : t`Not rated`}</span>
            <span
              role="img"
              className={`inline-flex items-center gap-0.5 ${delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-warning"}`}
              aria-label={`${delta > 0 ? t`Rating increased` : delta < 0 ? t`Rating decreased` : t`Rating unchanged`}: ${delta > 0 ? "+" : ""}${format.format(delta)}`}
            >
              {delta > 0 ? (
                <ArrowUp className="size-3" aria-hidden="true" />
              ) : delta < 0 ? (
                <ArrowDown className="size-3" aria-hidden="true" />
              ) : (
                <Equal className="size-3" aria-hidden="true" />
              )}
              {delta > 0 ? "+" : ""}
              {format.format(delta)}
            </span>
          </span>
        ) : (
          <span className="block truncate text-xs text-default-500">
            {player.email ?? t`Email unavailable`}
          </span>
        )}
      </span>
    </>
  );
}
