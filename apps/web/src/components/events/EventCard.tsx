"use client";
import type { ClientEventRecord } from "@board-game-organizer/shared";
import { useNotificationAttentionContext } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, RefreshCw, UsersRound } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ClientRecordBadge, useClientRecordStatus } from "@/components/common/ui/ClientRecordBadge";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { EventCardIndicators } from "./EventCardIndicators";

export function EventCard({
  event,
  context = "personal",
  onVerify,
  checking = false,
}: {
  event: ClientEventRecord;
  context?: "personal" | "group";
  onVerify?: () => void;
  checking?: boolean;
}) {
  const { t, i18n } = useLingui();
  const attention = useNotificationAttentionContext();
  const local = event.optimistic,
    status = useClientRecordStatus(local?.phase);
  const count = local ? undefined : attention?.get({ kind: "event", id: event.id })?.count;
  const href = local
    ? local.phase === "failed"
      ? `/events/new?draftId=${encodeURIComponent(local.draftId)}`
      : "/events"
    : `/events/${event.id}${context === "group" && event.groupId ? `?fromGroup=${encodeURIComponent(event.groupId)}` : ""}`;
  return (
    <LinkedListCard
      href={href}
      notificationCount={count}
      artworkLayout="cover"
      artwork={
        <AnimatedDicebearArtwork seed={event.id} variant="constellation" presentation="cover" />
      }
      leadingActions={local ? undefined : <EventCardIndicators event={event} />}
      disabled={Boolean(local && local.phase !== "failed")}
      label={`${status || t`Open event`}: ${event.name}`}
      actions={
        local?.phase === "verifying" && onVerify ? (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Check saved changes`}
            isDisabled={checking}
            onPress={onVerify}
          >
            <RefreshCw className="size-4" aria-hidden />
          </Button>
        ) : undefined
      }
    >
      <ListCardBody
        title={event.name}
        unread={Boolean(count)}
        titleIcon={<CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />}
        titleAccessory={local ? <ClientRecordBadge phase={local.phase} /> : undefined}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
          {event.groupId ? (
            <>
              <span className="inline-flex min-w-0 max-w-full items-start gap-1">
                <UsersRound className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="sr-only">{t`Group`}: </span>
                {event.groupName ? (
                  <span className="min-w-0 break-words">{event.groupName}</span>
                ) : (
                  <Skeleton aria-label={t`Loading…`} className="h-4 w-28 rounded" />
                )}
              </span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span className="inline-flex min-w-0 max-w-full items-start gap-1">
            <Dices className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              {i18n._({
                id: "event.card.tables",
                message: "{count, plural, one {# Table} other {# Tables}}",
                values: { count: event.tableCount },
              })}
            </span>
          </span>
        </div>
      </ListCardBody>
    </LinkedListCard>
  );
}
