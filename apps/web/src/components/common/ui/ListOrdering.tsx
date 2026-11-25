"use client";

import { type RecordListOrder, recordListSortFields } from "@board-game-organizer/schemas";
import { Button, Dropdown, Label } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowDown, ArrowUp, CalendarDays, ListOrdered } from "lucide-react";
import { memo } from "react";

export const ListOrdering = memo(function ListOrdering({
  order: { sort, direction },
  onChange,
}: {
  order: RecordListOrder;
  onChange: (order: RecordListOrder) => void;
}) {
  const { t } = useLingui();
  const fields = {
    name: { label: t`Name`, Icon: ListOrdered },
    date: { label: t`Date`, Icon: CalendarDays },
  };
  const { label, Icon } = fields[sort];
  const DirectionIcon = direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2">
      <span className="text-sm text-muted">{t`Sort by`}</span>
      <div className="flex items-center gap-1">
        <Dropdown>
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
          <Dropdown.Popover placement="bottom end">
            <Dropdown.Menu
              aria-label={t`Sort by`}
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[sort]}
            >
              {recordListSortFields.map((field) => {
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
});
