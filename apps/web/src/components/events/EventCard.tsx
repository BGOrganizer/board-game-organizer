"use client";
import type { EventResponse } from "@board-game-organizer/schemas";
import { formatLocationAddress } from "@board-game-organizer/shared";
import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import planets from "@dicebear/styles/planets.json" with { type: "json" };
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CalendarRange,
  Clock3,
  LayoutGrid,
  MapPin,
  UsersRound,
} from "lucide-react";
import { useMemo } from "react";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCard } from "@/components/common/ui/ListCard";

const style = new Style(planets);
export function EventCard({
  event,
  presentation = "list",
}: {
  event: EventResponse;
  presentation?: "list" | "detail";
}) {
  const { t, i18n } = useLingui();
  const src = useMemo(
    () =>
      `data:image/svg+xml,${encodeURIComponent(new DiceBearAvatar(style, { seed: event.id, size: 64 }).toString())}`,
    [event.id],
  );
  const date = new Intl.DateTimeFormat(i18n.locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: event.timeZone,
  }).format(new Date(event.startsAt));
  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: event.timeZone,
  });
  const start = time.format(new Date(event.startsAt)),
    end = time.format(new Date(event.endsAt));
  const label =
    event.status === "DRAFT"
      ? t`Draft`
      : event.status === "PUBLISHED"
        ? t`Published`
        : t`Cancelled`;
  const OrganizationIcon = event.organizationApproved ? BadgeCheck : Building2;
  const numbers = new Intl.NumberFormat(i18n.locale);
  const content = (
    <>
      <span className="size-16 shrink-0 overflow-hidden rounded-xl bg-accent/10" aria-hidden="true">
        {/* biome-ignore lint/performance/noImgElement: Locally generated DiceBear SVG; no remote request. */}
        <img src={src} alt="" width={64} height={64} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {presentation === "list" ? (
          <p className="flex min-h-6 items-center gap-1 pr-24 font-semibold">
            <OrganizationIcon className="size-4 shrink-0 text-default-500" aria-hidden />
            <span className="truncate">{event.organizationName}</span>
            {event.organizationApproved ? (
              <span className="sr-only">{t`Approved organization`}</span>
            ) : null}
          </p>
        ) : null}
        <Chip
          size="sm"
          color={
            event.status === "DRAFT"
              ? "warning"
              : event.status === "PUBLISHED"
                ? "success"
                : "danger"
          }
          variant="soft"
          className="absolute top-3 right-3"
        >
          {label}
        </Chip>
        <p
          className={`flex items-center gap-1 font-medium ${presentation === "detail" ? "min-h-6 pr-24" : ""}`}
        >
          <CalendarRange className="size-4 shrink-0 text-default-500" aria-hidden />
          <span className="truncate">{event.name}</span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs tabular-nums">
          <span className="flex min-w-0 items-center gap-1">
            <CalendarDays className="size-3.5 shrink-0 text-default-500" aria-hidden />
            <time dateTime={event.startsAt}>{date}</time>
          </span>
          <span className="flex items-center gap-1">
            <Clock3 className="size-3.5 text-default-500" aria-hidden />
            <span className="sr-only">{t`Start time`}: </span>
            <time dateTime={event.startsAt}>{start}</time>
          </span>
          <span className="flex items-center gap-1">
            <Clock3 className="size-3.5 text-default-500" aria-hidden />
            <span className="sr-only">{t`End time`}: </span>
            <time dateTime={event.endsAt}>{end}</time>
          </span>
        </div>
        <p className="flex items-start gap-1 text-sm">
          <MapPin className="size-4 shrink-0 text-default-500" aria-hidden />
          <span className="min-w-0 flex-1 break-words">
            <span className="font-medium">{event.location.name}</span> ·{" "}
            {formatLocationAddress(event.location.address)}
          </span>
        </p>
        <div className="flex items-center gap-4 text-sm tabular-nums">
          {presentation === "list" ? (
            <span className="flex items-center gap-1">
              <LayoutGrid className="size-4 text-default-500" aria-hidden />
              <span className="sr-only">{t`Tables`}: </span>
              {numbers.format(event.tableCount)}
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            <UsersRound className="size-4 text-default-500" aria-hidden />
            <span className="sr-only">{t`Confirmed participants`}: </span>
            {numbers.format(event.confirmedParticipantCount)}
          </span>
        </div>
      </div>
    </>
  );
  return presentation === "detail" ? (
    <ListCard>
      <div className="flex items-start gap-3 p-3">{content}</div>
    </ListCard>
  ) : (
    <LinkedListCard
      href={`/events/${event.id}`}
      label={`${t`Open event`}: ${event.name}, ${event.organizationName}${event.organizationApproved ? `, ${t`Approved organization`}` : ""}, ${label}, ${date}, ${start}–${end}, ${event.location.name}, ${formatLocationAddress(event.location.address)}, ${t`Tables`}: ${numbers.format(event.tableCount)}, ${t`Confirmed participants`}: ${numbers.format(event.confirmedParticipantCount)}`}
    >
      {content}
    </LinkedListCard>
  );
}
