"use client";
import type { EventDraftTable } from "@board-game-organizer/shared";
import { Avatar, Button, Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Clock3,
  Dices,
  LayoutGrid,
  Pencil,
  Presentation,
  Trash2,
  Trophy,
  UsersRound,
} from "lucide-react";

export function EventDraftTableCard({
  table,
  timeZone,
  busy,
  onEdit,
  onRemove,
}: {
  table: EventDraftTable;
  timeZone: string;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t, i18n } = useLingui();
  const dates = new Intl.DateTimeFormat(i18n.locale, {
    timeStyle: "short",
    timeZone,
  });
  const fields = [
    {
      Icon: Clock3,
      label: t`Start time`,
      value: dates.format(new Date(table.input.startsAt)),
    },
    { Icon: Clock3, label: t`End time`, value: dates.format(new Date(table.input.endsAt)) },
    { Icon: Dices, label: t`Board games`, value: table.gameName },
    {
      Icon: UsersRound,
      label: t`Players`,
      value: `${table.input.minPlayers}–${table.input.maxPlayers}`,
    },
    ...(table.demonstrator
      ? [
          {
            Icon: Presentation,
            label: t`Demonstrator`,
            value:
              table.demonstrator.username ?? table.demonstrator.name ?? t`Username unavailable`,
          },
        ]
      : []),
  ];
  return (
    <Card
      className="rounded-xl p-3"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
          <Avatar className="rounded-xl" style={{ width: 80, height: 80 }}>
            <Avatar.Image
              src={table.imageUrl ?? undefined}
              alt={table.gameName}
              className="object-contain"
            />
            <Avatar.Fallback>
              <Dices className="size-9" aria-hidden />
            </Avatar.Fallback>
          </Avatar>
          {table.input.openSkill ? (
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
            {table.input.name}
          </h3>
          {fields.map(({ Icon, label, value }) => (
            <p key={label} className="flex items-start gap-2 text-sm">
              <Icon className="size-4 shrink-0 text-default-500" aria-hidden />
              <span className="sr-only">{label}: </span>
              <span>{value}</span>
            </p>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          isIconOnly
          size="sm"
          variant="outline"
          isDisabled={busy}
          aria-label={`${t`Edit table`}: ${table.input.name}`}
          onPress={onEdit}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button
          isIconOnly
          size="sm"
          variant="danger-soft"
          isDisabled={busy}
          aria-label={`${t`Remove table`}: ${table.input.name}`}
          onPress={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </Card>
  );
}
