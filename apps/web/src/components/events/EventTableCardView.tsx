"use client";

import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useNotificationAttentionContext } from "@board-game-organizer/shared";
import { Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import {
  type CardNavigation,
  LinkedListCardLayout,
} from "@/components/common/ui/LinkedListCardLayout";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useTableTitle } from "@/lib/useTableTitle";

/** One horizontal card in both feeds. The context hint changes Back, never authority. */
export function EventTableCardView({
  table,
  context = "personal",
  indicators,
  renderNavigation,
}: {
  table: PlannedTableResponse;
  context?: "personal" | "event";
  indicators: ReactNode;
  renderNavigation: CardNavigation;
}) {
  const { t, i18n } = useLingui();
  const { getTableTitle } = useTableTitle();
  const title = getTableTitle(table);
  const attention = useNotificationAttentionContext();
  const count = attention?.get({ kind: "table", id: table.id })?.count;
  return (
    <LinkedListCardLayout
      renderNavigation={renderNavigation}
      heading={
        <ListCardBody
          title={title}
          unread={Boolean(count)}
          titleIcon={<Dices className="size-4 shrink-0 text-muted" aria-hidden />}
        />
      }
      href={`/events/${table.eventId}/tables/${table.id}${context === "event" ? `?fromEvent=${encodeURIComponent(table.eventId)}` : ""}`}
      label={`${t`Open table`}: ${title}`}
      notificationCount={count}
      artworkLayout="cover"
      artwork={<AnimatedDicebearArtwork seed={table.id} variant="tables" presentation="cover" />}
      leadingActions={indicators}
    >
      <p className="min-w-0 break-words text-sm tabular-nums text-foreground">
        {i18n._({
          id: "table.card.participants",
          message:
            "{count, plural, one {#/{capacity} participant} other {#/{capacity} participants}}",
          values: { count: table.seatedCount, capacity: i18n.number(table.maxPlayers) },
        })}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
        {table.groupId ? (
          <>
            <span className="inline-flex min-w-0 max-w-full items-start gap-1">
              <UsersRound className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="sr-only">{t`Group`}: </span>
              {table.groupName ? (
                <span className="min-w-0 break-words">{table.groupName}</span>
              ) : (
                <Skeleton aria-label={t`Loading…`} className="h-4 w-28 rounded" />
              )}
            </span>
            <span aria-hidden>·</span>
          </>
        ) : null}
        <span className="inline-flex min-w-0 max-w-full items-start gap-1">
          <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="sr-only">{t`Event`}: </span>
          <span className="min-w-0 break-words">{table.eventName}</span>
        </span>
      </div>
    </LinkedListCardLayout>
  );
}
