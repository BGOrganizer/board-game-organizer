"use client";

import { Button } from "@heroui/react";
import type { LucideIcon } from "lucide-react";

export function FilterChips<Key extends string>({
  options,
  selected,
  onToggle,
}: {
  options: readonly { key: Key; label: string; icon: LucideIcon; disabled?: boolean }[];
  selected: readonly Key[];
  onToggle: (key: Key) => void;
}) {
  return options.length ? (
    <div className="flex flex-wrap gap-1">
      {options.map(({ key, label, icon: Icon, disabled }) => {
        const active = selected.includes(key);
        return (
          <Button
            key={key}
            size="sm"
            variant={active ? "primary" : "secondary"}
            isDisabled={disabled}
            aria-pressed={active}
            onPress={() => onToggle(key)}
            className="group/filter h-7 min-w-11 rounded-lg bg-transparent p-0 [@media(pointer:coarse)]:h-11"
          >
            <span
              className={`inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs ${active ? "bg-accent text-accent-foreground" : "bg-surface-secondary text-foreground group-hover/filter:bg-default"}`}
            >
              <Icon className="m-0 size-3.5" aria-hidden="true" />
              {label}
            </span>
          </Button>
        );
      })}
    </div>
  ) : null;
}
