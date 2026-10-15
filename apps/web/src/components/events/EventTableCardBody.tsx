"use client";
import type { EventDraftTable } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import {
  Armchair,
  Clock3,
  Dices,
  LayoutGrid,
  LockKeyhole,
  Presentation,
  Trophy,
  UsersRound,
} from "lucide-react";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";

export function EventTableCardBody({
  table,
  timeZone,
  gameName,
  demonstrator,
  confirmedCount,
  reservedCount,
}: {
  table: EventDraftTable["input"];
  timeZone: string;
  gameName: string;
  imageUrl?: string | null;
  demonstrator?: { username?: string | null; name?: string | null } | null;
  confirmedCount?: number;
  reservedCount?: number;
}) {
  const { t, i18n } = useLingui();
  const dates = new Intl.DateTimeFormat(i18n.locale, { timeStyle: "short", timeZone });
  const fields = [
    { Icon: Clock3, label: t`Start time`, value: dates.format(new Date(table.startsAt)) },
    { Icon: Clock3, label: t`End time`, value: dates.format(new Date(table.endsAt)) },
    { Icon: Dices, label: t`Board games`, value: gameName },
  ];
  const playerFields = [
    { Icon: Armchair, label: t`Players`, value: `${table.minPlayers}–${table.maxPlayers}` },
    ...(confirmedCount !== undefined
      ? [{ Icon: UsersRound, label: t`confirmed players`, value: String(confirmedCount) }]
      : []),
    ...(reservedCount !== undefined
      ? [{ Icon: LockKeyhole, label: t`reserved places`, value: String(reservedCount) }]
      : []),
  ];
  return (
    <div className="flex items-start gap-3">
      <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
        <AnimatedDicebearArtwork seed={table.name} variant="shapes" size={80} />
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
        <div className="flex items-center gap-3 text-sm">
          {playerFields.map(({ Icon, label, value }) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <Icon className="size-4 shrink-0 text-default-500" aria-hidden />
              <span className="sr-only">{label}: </span>
              {value}
            </span>
          ))}
        </div>
        {demonstrator ? (
          <p className="flex items-start gap-2 text-sm">
            <Presentation className="size-4 shrink-0 text-default-500" aria-hidden />
            <span className="sr-only">{t`Demonstrator`}: </span>
            <span className="min-w-0 flex-1 break-words">
              {demonstrator.username ?? demonstrator.name ?? t`Username unavailable`}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
