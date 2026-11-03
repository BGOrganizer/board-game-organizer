"use client";
import type { ProfileActivity } from "@board-game-organizer/schemas";
import { profileActivityRelativeTime } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, Handshake, Trophy, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { GroupedRow } from "@/components/common/ui/GroupedRow";

export function ProfileActivityRow({ item }: { item: ProfileActivity }) {
  const { t, i18n } = useLingui();
  const labels = {
    played: t`Game played`,
    friendship: t`New friendship`,
    event_join: t`Joined an event`,
    table_join: t`Joined a table`,
    group_join: t`Joined a group`,
    follower: t`New follower`,
    milestone: t`Victory milestone`,
  };
  const icons = {
    played: Dices,
    friendship: Handshake,
    event_join: CalendarDays,
    table_join: Dices,
    group_join: UsersRound,
    follower: UserRoundPlus,
    milestone: Trophy,
  };
  const Icon = icons[item.kind];
  const body = (
    <>
      <Icon className="size-5 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block font-medium">
          {labels[item.kind]}
          {item.kind === "played"
            ? ` · ${item.outcome === "won" ? t`Won` : t`Completed`}`
            : item.milestone
              ? ` · ${new Intl.NumberFormat(i18n.locale).format(item.milestone)}`
              : ""}
        </span>
        {item.context ? (
          <span className="block break-words text-sm text-muted">{item.context}</span>
        ) : null}
        <time dateTime={item.occurredAt} className="block text-xs text-muted">
          {profileActivityRelativeTime(item.occurredAt, (id, values) => i18n._({ id, values }))}
        </time>
      </span>
    </>
  );
  return (
    <GroupedRow>
      {item.href ? (
        <Link
          href={item.href}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={`${labels[item.kind]}: ${item.context ?? ""}`}
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
    </GroupedRow>
  );
}
