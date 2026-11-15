"use client";

import type { PlayerPoll } from "@board-game-organizer/schemas";
import { gameBestPlayers } from "@board-game-organizer/shared";

import { Plural, useLingui } from "@lingui/react/macro";
import { Clock, ListOrdered, Star, UsersRound } from "lucide-react";

type Props = {
  year?: number | null;
  average?: number | null;
  rank?: number | null;
  durationMinutes?: number;
  suggestedPlayers?: PlayerPoll;
};

export function GameCatalogMetadata({
  year,
  average,
  rank,
  durationMinutes,
  suggestedPlayers,
}: Props) {
  const { t, i18n } = useLingui();
  const bestPlayers = gameBestPlayers(suggestedPlayers);
  if (!year && average == null && rank == null && durationMinutes == null && !bestPlayers)
    return null;
  const rating = average?.toLocaleString(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const position = rank === 0 ? t`Unranked` : rank?.toLocaleString(i18n.locale);
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {year ? <span>{year}</span> : null}
      {durationMinutes != null ? (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          <Plural
            id="game.duration.minutes"
            value={durationMinutes}
            one="# minute"
            other="# minutes"
          />
        </span>
      ) : null}
      {rating != null && (
        <span
          className="inline-flex items-center gap-1"
          role="img"
          aria-label={`${t`Average`}: ${rating}`}
        >
          <Star className="h-3 w-3 fill-warning text-warning" aria-hidden="true" />
          {rating}
        </span>
      )}
      {position != null && (
        <span
          className="inline-flex items-center gap-1"
          role="img"
          aria-label={`${t`Rank`}: ${position}`}
        >
          <ListOrdered className="h-3 w-3" aria-hidden="true" />
          {position}
        </span>
      )}
      {bestPlayers ? (
        <span
          className="inline-flex items-center gap-1"
          role="img"
          aria-label={`${t`Best BGG players`}: ${bestPlayers}`}
        >
          <UsersRound className="h-3 w-3" aria-hidden="true" />
          {bestPlayers}
        </span>
      ) : null}
    </p>
  );
}
