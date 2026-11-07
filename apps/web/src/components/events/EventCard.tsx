"use client";
import type { ClientEventRecord } from "@board-game-organizer/shared";
import {
  eventParticipation,
  eventPendingAction,
  eventRecordSchedulePreview,
  useEventCutoff,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, RefreshCw, UsersRound } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { ClientRecordBadge, useClientRecordStatus } from "@/components/common/ui/ClientRecordBadge";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { EventCardSchedule } from "./EventCardSchedule";
import { EventStatusBadge } from "./EventStatusBadge";
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
  const { t, i18n } = useLingui(),
    number = new Intl.NumberFormat(i18n.locale);
  const attention = useNotificationAttentionContext(),
    attentionTarget = { kind: "event", id: event.id } as const;
  const closed = useEventCutoff(
    event.bookingClosesAt,
    event.groupType === "PUBLIC" && event.status === "PLANNING",
  );
  const participation = eventParticipation(event.myRegistrations);
  const indicator = participation === null && event.role === "admin" ? "admin" : participation;
  const local = event.optimistic,
    status = useClientRecordStatus(local?.phase);
  const href = local
    ? local.phase === "failed"
      ? `/events/new?draftId=${encodeURIComponent(local.draftId)}`
      : "/events"
    : `/events/${event.id}${context === "group" && event.groupId ? `?fromGroup=${encodeURIComponent(event.groupId)}` : ""}`;
  return (
    <LinkedListCard
      href={href}
      notificationCount={local ? undefined : attention?.get(attentionTarget)?.count}
      leadingActions={
        <>
          {indicator !== null ? (
            <ArtworkStatusPopover
              kind={indicator}
              action={local || closed ? null : eventPendingAction(event)}
            />
          ) : !local ? (
            <ArtworkStatusPopover kind={event.role === "member" ? "member" : "viewer"} />
          ) : null}
          {!local && event.canManage && indicator !== "admin" ? (
            <ArtworkStatusPopover kind="manager" />
          ) : null}
          {!local && event.myDemonstrator ? <ArtworkStatusPopover kind="demonstrator" /> : null}
        </>
      }
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
      artwork={<AnimatedDicebearArtwork seed={event.id} variant="constellation" />}
    >
      <ListCardBody
        title={event.name}
        unread={!local && Boolean(attention?.get(attentionTarget)?.count)}
        titleIcon={<CalendarDays className="size-4 shrink-0" aria-hidden />}
        titleAccessory={
          local ? (
            <ClientRecordBadge phase={local.phase} />
          ) : (
            <EventStatusBadge status={event.status} />
          )
        }
      >
        {event.groupName ? (
          <p className="flex items-center gap-1 text-sm text-muted">
            <UsersRound className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              {t`Group`}: {event.groupName}
            </span>
          </p>
        ) : null}
        <EventCardSchedule schedule={eventRecordSchedulePreview(event)} />
        <div
          className={`flex flex-wrap items-center gap-3 text-sm ${local?.phase === "verifying" && onVerify ? "pr-10" : ""}`}
        >
          <span className="inline-flex items-center gap-1">
            <Dices className="size-4 text-muted" aria-hidden />
            {t`Tables`}: {number.format(event.tableCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <UsersRound className="size-4 text-muted" aria-hidden />
            {t`Players`}: {number.format(event.participantCount)}
          </span>
        </div>
      </ListCardBody>
    </LinkedListCard>
  );
}
