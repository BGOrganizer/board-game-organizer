"use client";
import type { ProfileRatingPoint } from "@board-game-organizer/schemas";
import { profileRatingPath } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
export function ProfileRatingChart({ points }: { points: ProfileRatingPoint[] }) {
  const { t } = useLingui();
  if (points.length < 2)
    return <p className="text-sm text-muted">{t`Not enough ranked games for a chart`}</p>;
  return (
    <div className="space-y-2">
      <svg
        role="img"
        aria-label={t`OpenSkill rating history`}
        width="100%"
        height="160"
        viewBox="0 0 300 160"
        className="text-accent"
      >
        <polyline
          points={profileRatingPath(points, 300, 160)}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <div className="flex justify-between text-xs text-muted">
        <span>{points[0].ordinal}</span>
        <span>{t`Classified games`}</span>
        <span>{points[points.length - 1].ordinal}</span>
      </div>
    </div>
  );
}
