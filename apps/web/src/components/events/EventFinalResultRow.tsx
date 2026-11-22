"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  type EventTablePerson,
  type TablePlayerRatingRow,
  tablePlayerRatingRows,
} from "@board-game-organizer/shared";
import { Accordion, Card, Chip, Separator } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Clock3, Globe, Minus, TrendingDown, TrendingUp, Trophy, UsersRound } from "lucide-react";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { UserIdentity } from "@/components/common/ui/UserIdentity";

function ResultRating({ row }: { row: TablePlayerRatingRow }) {
  const { t, i18n } = useLingui();
  const group = row.scope === "GROUP";
  const ScopeIcon = group ? UsersRound : Globe;
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const delta = row.delta ?? 0;
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-1.5 gap-y-0.5 text-xs">
      <span className="inline-flex shrink-0 items-center gap-1">
        <ScopeIcon
          aria-hidden
          className={`size-3.5 ${group ? "text-success-soft-foreground" : "text-accent"}`}
        />
        {group ? t`Group` : t`Global`}
      </span>
      {row.state === "recorded" ? (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums">
          <span className="text-muted">
            <span className="sr-only">{t`Rating before`}: </span>
            {number.format(row.before as number)}
          </span>
          <span aria-hidden className="text-muted">
            →
          </span>
          <span className="inline-flex items-center gap-0.5 font-semibold">
            <span className="sr-only">{t`Rating after`}: </span>
            {number.format(row.after as number)}
            {row.provisional ? (
              <Clock3
                role="img"
                aria-label={t`Provisional rating`}
                className="size-3 text-warning"
              />
            ) : null}
          </span>
          <Chip
            size="sm"
            variant="soft"
            color={delta > 0 ? "success" : delta < 0 ? "danger" : "default"}
            className="min-w-0 gap-0.5 px-1"
          >
            <DeltaIcon aria-hidden className="size-3 shrink-0" />
            <span className="sr-only">{t`Rating change`}: </span>
            {delta > 0 ? "+" : ""}
            {number.format(delta)}
          </Chip>
        </span>
      ) : (
        <span className="ml-auto text-right text-muted">
          {row.state === "notUpdated" ? t`Ranking not updated` : t`Historical ranking unavailable`}
        </span>
      )}
    </div>
  );
}

export function EventFinalResultRow({
  table,
  player,
  name,
}: {
  table: PlannedTableResponse;
  player: EventTablePerson;
  name: string;
}) {
  const { t } = useLingui();
  const position = player.rank == null ? t`ND` : `#${player.rank}`;
  const score = player.score ?? t`ND`;
  const row = (
    <>
      <UserIdentity
        name={name}
        avatarUrl={player.avatarUrl}
        avatarContent={player.guestName ? <GuestAvatar name={player.guestName} /> : undefined}
        secondary={player.guestName ? t`Guest` : undefined}
        badge={
          <Chip
            role="img"
            aria-label={`${t`Position`}: ${position}`}
            size="sm"
            color={player.rank === 1 ? "warning" : "default"}
            variant="secondary"
            className="min-h-0 min-w-5 justify-center rounded-full px-1 tabular-nums"
          >
            {position}
          </Chip>
        }
      >
        {player.rank === 1 ? (
          <span className="flex items-center gap-1 text-xs text-warning-soft-foreground">
            <Trophy aria-hidden className="size-3" />
            {t`Winner`}
          </span>
        ) : null}
      </UserIdentity>
      <span className="grid shrink-0 justify-items-end tabular-nums" title={score}>
        <span className="text-xs font-normal text-muted">{t`Score`}</span>
        <strong className="text-base">{score}</strong>
      </span>
    </>
  );
  return (
    <li>
      <Card variant="secondary" className="gap-0 p-0">
        {player.guestName ? (
          <div className="flex min-w-0 items-center gap-2 pr-9 pl-3">{row}</div>
        ) : (
          <Accordion hideSeparator>
            <Accordion.Item id={player.key}>
              {({ isExpanded }) => (
                <>
                  <Accordion.Heading>
                    <Accordion.Trigger className="min-h-16 gap-2 px-3 py-0 text-foreground">
                      <span className="sr-only">{t`Rating details`}</span>
                      {row}
                      <Accordion.Indicator
                        aria-hidden
                        className="ml-0 size-4 shrink-0 text-muted"
                      />
                    </Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    {isExpanded ? (
                      <Accordion.Body className="grid gap-1.5 px-3 pt-0 pb-2">
                        <Separator />
                        {tablePlayerRatingRows(table, player.userId)
                          .reverse()
                          .map((rating) => (
                            <ResultRating key={rating.scope} row={rating} />
                          ))}
                      </Accordion.Body>
                    ) : null}
                  </Accordion.Panel>
                </>
              )}
            </Accordion.Item>
          </Accordion>
        )}
      </Card>
    </li>
  );
}
