"use client";

import { Button } from "@heroui/react";
import type { LucideIcon } from "lucide-react";

export function FilterChips<Key extends string>({
  options,
  selected,
  onToggle,
}: {
  options: readonly { key: Key; label: string; icon: LucideIcon }[];
  selected: readonly Key[];
  onToggle: (key: Key) => void;
}) {
  return options.length ? (
    <div className="flex flex-wrap gap-2">
      {options.map(({ key, label, icon: Icon }) => (
        <Button
          key={key}
          size="sm"
          variant={selected.includes(key) ? "primary" : "secondary"}
          className="h-7 min-h-7 gap-1.5 px-2 py-0 text-xs"
          aria-pressed={selected.includes(key)}
          onPress={() => onToggle(key)}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </Button>
      ))}
    </div>
  ) : null;
}
