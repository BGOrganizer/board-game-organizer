"use client";
import type { PlannedTableResponse, TableLeaderboardPlayer } from "@board-game-organizer/schemas";
import { tablePlayerRatingRows } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import {
  ChartNoAxesCombined,
  Clock3,
  Globe,
  Minus,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";

export function EventPlayerRatingPopover({
  table,
  userId,
  name,
  current,
}: {
  table: PlannedTableResponse;
  userId: string;
  name: string;
  current?: TableLeaderboardPlayer;
}) {
  const { t, i18n } = useLingui();
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const game = table.gamesDetail.find((row) => row.id === table.confirmed?.gameId);
  return (
    <HelpPopover
      size="compact"
      label={`${t`Ranking`}: ${name}`}
      title={game ? `${t`Ranking`} · ${game.name}` : t`Ranking`}
      icon={ChartNoAxesCombined}
      tone="accent"
      triggerClassName="bg-default"
      className="w-[min(25rem,calc(100vw-2rem))]"
    >
      <div className="space-y-3">
        {tablePlayerRatingRows(table, userId, current).map((row) => {
          const Icon = row.scope === "GLOBAL" ? Globe : UsersRound;
          const Delta =
            row.delta !== undefined && row.delta > 0
              ? TrendingUp
              : row.delta !== undefined && row.delta < 0
                ? TrendingDown
                : Minus;
          return (
            <div key={row.scope} className="flex flex-wrap items-center gap-3">
              <p className="flex items-center gap-1">
                <Icon aria-hidden className="size-4 shrink-0 text-accent" />
                {row.scope === "GLOBAL" ? t`Global ranking` : t`Group ranking`}
              </p>
              {row.state === "notUpdated" ? (
                <p className="text-muted">{t`Ranking not updated`}</p>
              ) : row.state === "unavailable" ? (
                <p className="text-muted">
                  {table.eventStatus === "TERMINATED"
                    ? t`Historical ranking unavailable`
                    : t`Ranking unavailable`}
                </p>
              ) : (
                <>
                  {row.state === "recorded" ? (
                    <div>
                      <p className="text-xs text-muted">{t`Rating before`}</p>
                      <p>{number.format(row.before as number)}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs text-muted">
                      {row.state === "recorded" ? t`Rating after` : t`Ranking`}
                    </p>
                    <p className="flex items-center gap-1">
                      {number.format(row.after as number)}
                      {row.provisional ? (
                        <Clock3
                          role="img"
                          aria-label={t`Provisional rating`}
                          className="size-4 text-warning"
                        />
                      ) : null}
                    </p>
                  </div>
                  {row.delta !== undefined ? (
                    <div>
                      <p className="text-xs text-muted">{t`Rating change`}</p>
                      <p
                        className={`flex items-center gap-1 ${row.delta > 0 ? "text-success-soft-foreground" : row.delta < 0 ? "text-danger-soft-foreground" : "text-muted"}`}
                      >
                        <Delta aria-hidden className="size-4" />
                        {row.delta > 0 ? "+" : ""}
                        {number.format(row.delta)}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </HelpPopover>
  );
}
