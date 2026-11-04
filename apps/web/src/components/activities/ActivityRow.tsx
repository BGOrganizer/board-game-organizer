"use client";
import type { ActivityAuthor, ProfileActivity } from "@board-game-organizer/schemas";
import { profileActivityRelativeTime } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, Handshake, Trophy, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { UserIdentity } from "@/components/common/ui/UserIdentity";

export function ActivityRow({ item, author }: { item: ProfileActivity; author?: ActivityAuthor }) {
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
  const Icon = item.kind === "played" && item.outcome === "won" ? Trophy : icons[item.kind];
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
          <span className="block break-words text-sm text-foreground">
            <strong>{item.context}</strong>
            {item.eventContext ? (
              <span className="block text-xs text-muted">{item.eventContext}</span>
            ) : null}
          </span>
        ) : null}
        <time dateTime={item.occurredAt} className="block text-xs text-muted">
          {profileActivityRelativeTime(item.occurredAt, (id, values) => i18n._({ id, values }))}
        </time>
      </span>
    </>
  );
  return (
    <GroupedRow className="flex-col items-stretch gap-1">
      {author ? (
        <Link
          href={`/profiles/${encodeURIComponent(author.id)}`}
          className="flex min-h-11 min-w-0 items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={author.username || author.name || t`Username unavailable`}
        >
          <UserIdentity
            name={author.username || author.name || t`Username unavailable`}
            avatarUrl={author.avatarUrl}
          />
        </Link>
      ) : null}
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
