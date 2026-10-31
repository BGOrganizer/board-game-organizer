"use client";
import type { EventVoteCounts as Counts } from "@board-game-organizer/schemas";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Minus, X } from "lucide-react";
export function EventVoteCounts({ counts, label }: { counts?: Counts; label: string }) {
  const { t, i18n } = useLingui();
  if (!counts) return <Skeleton className="h-4 w-28 rounded" />;
  const number = new Intl.NumberFormat(i18n.locale);
  return (
    <dl
      aria-label={`${t`Votes`}: ${label}`}
      className="inline-flex flex-wrap items-center gap-2 text-xs tabular-nums"
    >
      {[
        { key: "YES", text: t`Yes`, Icon: Check, color: "text-success" },
        { key: "IF_NEEDED", text: t`If needed`, Icon: Minus, color: "text-warning" },
        { key: "NO", text: t`No`, Icon: X, color: "text-danger" },
      ].map(({ key, text, Icon, color }) => (
        <div key={key} className="inline-flex items-center gap-0.5">
          <dt>
            <Icon aria-hidden className={`size-3 ${color}`} />
            <span className="sr-only">{text}</span>
          </dt>
          <dd>{number.format(counts[key as keyof Counts])}</dd>
        </div>
      ))}
    </dl>
  );
}
