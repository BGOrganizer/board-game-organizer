"use client";
import type { ActivityAuthor, ProfileActivity } from "@board-game-organizer/schemas";
import { activityNarrative, profileActivityRelativeTime } from "@board-game-organizer/shared";
import { Trans } from "@lingui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, Dices, Handshake, Trophy, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { GroupedRow } from "@/components/common/ui/GroupedRow";

export function ActivityRow({
  item,
  author,
  viewerId,
}: {
  item: ProfileActivity;
  author?: ActivityAuthor;
  viewerId?: string | null;
}) {
  const { t, i18n } = useLingui();
  const story = activityNarrative(item, author, t`Someone`, t`Unavailable source`, {
    id: viewerId,
    name: t`You`,
  });
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
  const components = Object.fromEntries(
    ["actor", "target"].map((slot) => {
      const person = story[slot as "actor" | "target"];
      return [
        slot,
        person.href ? (
          <Link
            key={slot}
            href={person.href}
            className="rounded font-medium focus-visible:outline-2 focus-visible:outline-accent"
          >
            {person.name}
          </Link>
        ) : (
          <strong key={slot}>{person.name}</strong>
        ),
      ];
    }),
  );
  return (
    <GroupedRow>
      <Icon className="size-5 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="break-words text-sm text-foreground">
          <Trans id={story.id} values={{ count: story.count }} components={components} />
        </p>
        {item.eventContext ? (
          <p className="break-words text-xs text-muted">{item.eventContext}</p>
        ) : null}
        <time dateTime={item.occurredAt} className="block text-xs text-muted">
          {profileActivityRelativeTime(item.occurredAt, (id, values) => i18n._({ id, values }))}
        </time>
      </div>
    </GroupedRow>
  );
}
