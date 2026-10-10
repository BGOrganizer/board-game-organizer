"use client";
import type { EventDraftTable } from "@board-game-organizer/shared";
import { Avatar } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Clock3, Dices, LayoutGrid, Presentation, Trophy, UsersRound } from "lucide-react";

export function EventTableCardBody({
  table,
  timeZone,
  gameName,
  imageUrl,
  demonstrator,
}: {
  table: EventDraftTable["input"];
  timeZone: string;
  gameName: string;
  imageUrl?: string | null;
  demonstrator?: { username?: string | null; name?: string | null } | null;
}) {
  const { t, i18n } = useLingui();
  const dates = new Intl.DateTimeFormat(i18n.locale, { timeStyle: "short", timeZone });
  const fields = [
    { Icon: Clock3, label: t`Start time`, value: dates.format(new Date(table.startsAt)) },
    { Icon: Clock3, label: t`End time`, value: dates.format(new Date(table.endsAt)) },
    { Icon: Dices, label: t`Board games`, value: gameName },
    { Icon: UsersRound, label: t`Players`, value: `${table.minPlayers}–${table.maxPlayers}` },
    ...(demonstrator
      ? [
          {
            Icon: Presentation,
            label: t`Demonstrator`,
            value: demonstrator.username ?? demonstrator.name ?? t`Username unavailable`,
          },
        ]
      : []),
  ];
  return (
    <div className="flex items-start gap-3">
      <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
        <Avatar className="rounded-xl" style={{ width: 80, height: 80 }}>
          <Avatar.Image src={imageUrl ?? undefined} alt={gameName} className="object-contain" />
          <Avatar.Fallback>
            <Dices className="size-9" aria-hidden />
          </Avatar.Fallback>
        </Avatar>
        {table.openSkill ? (
          <span
            role="img"
            aria-label={t`Global ratings enabled`}
            className="absolute -bottom-1 -right-1 rounded-full bg-surface p-1"
          >
            <Trophy className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="flex items-start gap-2 font-semibold">
          <LayoutGrid className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 break-words">{table.name}</span>
        </h3>
        {fields.map(({ Icon, label, value }) => (
          <p key={label} className="flex items-start gap-2 text-sm">
            <Icon className="size-4 shrink-0 text-default-500" aria-hidden />
            <span className="sr-only">{label}: </span>
            <span className="min-w-0 flex-1 break-words">{value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}
