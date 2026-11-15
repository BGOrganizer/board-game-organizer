"use client";

import type { TableCardSummary } from "@board-game-organizer/schemas";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { useState } from "react";
import { cardExclusionMessages, cardPlanningMessages } from "@/lib/eventCardMessages";

/** Bounded local pages of the card's authorized projection; never loads another Table detail. */
export function EventCardTableSummaries({
  tables,
  mode,
  showNames = true,
}: {
  tables: readonly TableCardSummary[];
  mode: "planning" | "exclusions" | "results";
  showNames?: boolean;
}) {
  const { t, i18n } = useLingui();
  const [requestedPage, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(tables.length / 8));
  const page = Math.min(requestedPage, pageCount - 1);
  return (
    <>
      <ul className="max-h-[50vh] space-y-3 overflow-y-auto overscroll-contain">
        {tables.slice(page * 8, (page + 1) * 8).map((table) => (
          <li key={table.tableId}>
            {showNames && mode !== "results" ? <p className="font-semibold">{table.name}</p> : null}
            {mode === "planning" ? (
              table.ready ? (
                <p>{t`This table is ready for confirmation.`}</p>
              ) : (
                <ul className="space-y-1">
                  {table.blockers.map((code) => (
                    <li key={code}>{i18n._(cardPlanningMessages[code])}</li>
                  ))}
                </ul>
              )
            ) : mode === "exclusions" ? (
              <ul className="space-y-1">
                {table.exclusionReasons.map((code) => (
                  <li key={code}>{i18n._(cardExclusionMessages[code])}</li>
                ))}
              </ul>
            ) : (
              <p className="break-words">
                {showNames ? (
                  <>
                    <span className="font-semibold">{table.name}</span>{" "}
                  </>
                ) : null}
                {table.winners.length ? (
                  <>
                    <Trophy
                      aria-hidden
                      className="mr-1 inline size-4 align-text-bottom text-warning-soft-foreground"
                    />
                    {table.winners
                      .map((winner) =>
                        winner.username
                          ? `@${winner.username.replace(/^@/, "")}`
                          : t`Username unavailable`,
                      )
                      .join(", ")}
                  </>
                ) : (
                  t`No winners.`
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
      {!tables.length ? (
        <p>{mode === "results" ? t`No winners.` : t`No tables are ready for confirmation.`}</p>
      ) : null}
      {pageCount > 1 ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            aria-label={t`Previous page`}
            aria-disabled={page === 0}
            onPress={() => setPage(Math.max(0, page - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="text-sm tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            isIconOnly
            size="sm"
            variant="secondary"
            aria-label={t`Next page`}
            aria-disabled={page === pageCount - 1}
            onPress={() => setPage(Math.min(pageCount - 1, page + 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
    </>
  );
}
