"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { eventTablePeople } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { Minus, Plus } from "lucide-react";
import { EventPlayerCard } from "./EventPlayerCard";

function RatingDelta({
  value,
  format,
}: {
  value: number | undefined;
  format: (value: number) => string;
}) {
  if (value === undefined) return <p>—</p>;
  const Icon = value < 0 ? Minus : Plus;
  return (
    <p
      className={`inline-flex items-center gap-1 ${value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-default-500"}`}
    >
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{value < 0 ? "-" : "+"}</span>
      {format(Math.abs(value))}
    </p>
  );
}
export function EventTableResults({ table }: { table: PlannedTableResponse }) {
  const { t, i18n } = useLingui(),
    number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const rows = eventTablePeople(table, []);
  return (
    <section aria-label={t`Results`} className="space-y-3">
      {!rows.length ? <p>{t`Excluded from confirmation`}</p> : null}
      {rows.map((row) => {
        const group =
          table.rankingEnabled && table.groupId
            ? table.groupRatingChanges?.find((value) => value.userId === row.userId)
            : undefined;
        const global = table.rankingEnabled
          ? table.ratingChanges?.find((value) => value.userId === row.userId)
          : undefined;
        return (
          <EventPlayerCard
            key={row.key}
            name={row.profileLoaded ? row.name : undefined}
            username={row.username}
            avatarUrl={row.avatarUrl}
            footer={
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-default-500">{t`Score`}</p>
                  <p>{row.score ?? t`ND`}</p>
                </div>
                <div>
                  <p className="text-xs text-default-500">{t`Global rating change`}</p>
                  <RatingDelta value={global?.delta} format={number.format} />
                </div>
                <div>
                  <p className="text-xs text-default-500">{t`Group rating change`}</p>
                  <RatingDelta value={group?.delta} format={number.format} />
                </div>
              </div>
            }
          >
            <div>
              <p className="text-xs text-default-500">{t`Position`}</p>
              <p>{row.rank ?? t`ND`}</p>
            </div>
            <div>
              <p className="text-xs text-default-500">{t`Rating before`}</p>
              <p>{group ? number.format(group.score - group.delta) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-default-500">{t`Global ranking`}</p>
              <p>{global ? number.format(global.score) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-default-500">{t`Group ranking`}</p>
              <p>{group ? number.format(group.score) : "—"}</p>
            </div>
          </EventPlayerCard>
        );
      })}
    </section>
  );
}
