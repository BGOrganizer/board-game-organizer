import type { MatchDetailResponse, MatchGameRating } from "@board-game-organizer/schemas";
import { Avatar } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ArrowUp, ChartNoAxesCombined, Clock3, Equal } from "lucide-react";

export function GameRating({
  rating,
  showDelta = false,
}: {
  rating?: { score: number; provisional: boolean; delta?: number };
  showDelta?: boolean;
}) {
  const { t, i18n } = useLingui();
  const format = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const delta = Number((rating?.delta ?? 0).toFixed(2)) || 0;
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-default-500">
      <span
        role="img"
        aria-label={rating?.provisional ? t`Provisional game rating` : t`Game rating`}
        className="relative inline-flex shrink-0"
      >
        <ChartNoAxesCombined className="size-3.5" aria-hidden="true" />
        {rating?.provisional && (
          <Clock3
            className="absolute -right-1 -bottom-1 size-2.5 text-warning"
            aria-hidden="true"
          />
        )}
      </span>
      <span>{rating ? format.format(rating.score) : t`Not rated`}</span>
      {showDelta && (
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
      )}
    </span>
  );
}

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
        {showGameRating ? (
          <GameRating rating={gameRating} showDelta />
        ) : (
          <span className="block truncate text-xs text-default-500">
            {player.email ?? t`Email unavailable`}
          </span>
        )}
      </span>
    </>
  );
}
