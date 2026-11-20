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
    <div className="flex flex-wrap gap-2">
      {options.map(({ key, label, icon: Icon, disabled }) => (
        <Button
          key={key}
          size="sm"
          variant={selected.includes(key) ? "primary" : "secondary"}
          isDisabled={disabled}
          aria-pressed={selected.includes(key)}
          onPress={() => onToggle(key)}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </Button>
      ))}
    </div>
  ) : null;
}
