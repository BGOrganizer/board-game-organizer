"use client";
import type { ClientEventRecord } from "@board-game-organizer/shared";
import { eventDateWall, eventRecordPreviewDate } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, RefreshCw, UsersRound } from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ClientRecordBadge, useClientRecordStatus } from "@/components/common/ui/ClientRecordBadge";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
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
    date = eventRecordPreviewDate(event),
    number = new Intl.NumberFormat(i18n.locale);
  const planning = event.status === "PLANNING";
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
      <AnimatedDicebearArtwork seed={event.id} variant="constellation" />
      <ListCardBody
        title={event.name}
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
          <p className="flex items-center gap-1 text-sm text-default-500">
            <UsersRound className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{event.groupName}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {date ? (
            <div className="min-w-0">
              <DateTimeInfo startsAt={`${eventDateWall(event, date)}Z`} timeZone="UTC" />
            </div>
          ) : (
            <p>{t`Dates to agree`}</p>
          )}
          {planning && event.dates.length > 1 ? (
            <span
              className="text-accent"
              role="img"
              aria-label={i18n._({
                id: "event.proposedDatesCount",
                message: "{count} proposed dates",
                values: { count: number.format(event.dates.length) },
              })}
            >
              +{number.format(event.dates.length)}
            </span>
          ) : null}
        </div>
        <div
          className={`flex flex-wrap items-center gap-3 text-sm ${local?.phase === "verifying" && onVerify ? "pr-10" : ""}`}
        >
          <span className="inline-flex items-center gap-1">
            <Dices className="size-4 text-default-500" aria-hidden />
            {t`Tables`}: {number.format(event.tableCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <UsersRound className="size-4 text-default-500" aria-hidden />
            {t`Players`}: {number.format(event.participantCount)}
          </span>
        </div>
      </ListCardBody>
    </LinkedListCard>
  );
}
