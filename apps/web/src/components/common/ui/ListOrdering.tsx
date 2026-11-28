"use client";

import type { HistoryTableListSortField, RecordListOrder } from "@board-game-organizer/schemas";
import { Button, Dropdown, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ArrowUp, CalendarDays, ListOrdered, UsersRound } from "lucide-react";
import { memo, useState } from "react";

function ListOrderingControl<Field extends HistoryTableListSortField>({
  order: { sort, direction },
  onChange,
  fields: availableFields,
}: {
  order: RecordListOrder<Field>;
  onChange: (order: RecordListOrder<Field>) => void;
  fields: readonly Field[];
}) {
  const { t } = useLingui();
  const [hasOpened, setHasOpened] = useState(false);
  const fields = {
    name: { label: t`Name`, Icon: ListOrdered },
    date: { label: t`Date`, Icon: CalendarDays },
    participants: { label: t`Number of players`, Icon: UsersRound },
  };
  const { label, Icon } = fields[sort];
  const DirectionIcon = direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2">
      <span className="text-sm text-muted">{t`Sort by`}</span>
      <div className="flex items-center gap-1">
        <Dropdown
          onOpenChange={(open) => {
            if (open && !hasOpened) setHasOpened(true);
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            className="min-h-8 min-w-11 px-0 [@media(pointer:coarse)]:min-h-11"
            aria-label={`${t`Sort by`} ${label}`}
          >
            <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-surface-secondary px-2 text-xs">
              <Icon className="size-3.5 text-accent" aria-hidden />
              {label}
            </span>
          </Button>
          {hasOpened ? (
            <Dropdown.Popover placement="bottom end">
              <Dropdown.Menu
                aria-label={t`Sort by`}
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[sort]}
              >
                {availableFields.map((field) => {
                  const { Icon, label } = fields[field];
                  return (
                    <Dropdown.Item
                      key={field}
                      id={field}
                      textValue={label}
                      onAction={() => onChange({ sort: field, direction })}
                    >
                      <Icon className="size-4 text-accent" aria-hidden />
                      <Label>{label}</Label>
                      <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                  );
                })}
              </Dropdown.Menu>
            </Dropdown.Popover>
          ) : null}
        </Dropdown>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          className="min-h-8 min-w-8 p-0 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          aria-label={direction === "asc" ? t`Sort descending` : t`Sort ascending`}
          onPress={() => onChange({ sort, direction: direction === "asc" ? "desc" : "asc" })}
        >
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-secondary">
            <DirectionIcon className="size-3.5" aria-hidden />
          </span>
        </Button>
      </div>
    </div>
  );
}

export const ListOrdering = memo(ListOrderingControl) as typeof ListOrderingControl;
