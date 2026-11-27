"use client";

import { groupDiscoveryRadiusPresetsKm } from "@board-game-organizer/schemas";
import { Button, Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, ChevronDown, Ruler } from "lucide-react";
import { useState } from "react";

export function GroupSearchDistance({
  radiusKm,
  onChange,
}: {
  radiusKm: number;
  onChange: (radiusKm: number) => void;
}) {
  const { t } = useLingui();
  const [isOpen, setOpen] = useState(false);
  const value = `${radiusKm} km`;
  const selectRadius = (radius: number) => {
    setOpen(false);
    onChange(radius);
  };

  return (
    <Popover isOpen={isOpen} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="ghost"
        aria-label={t`Distance, ${value}`}
        className="group/distance h-7 min-w-11 rounded-lg bg-transparent p-0 [@media(pointer:coarse)]:h-11"
      >
        <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-surface-secondary px-1.5 text-foreground text-xs group-hover/distance:bg-default">
          <Ruler className="size-3.5" aria-hidden />
          {value}
          <ChevronDown className="size-3.5" aria-hidden />
        </span>
      </Button>
      <Popover.Content placement="bottom end" className="w-56">
        <Popover.Dialog className="flex flex-col gap-1 p-2">
          <Popover.Heading className="px-2 text-sm">{t`Distance`}</Popover.Heading>
          {groupDiscoveryRadiusPresetsKm.map((radius) => (
            <Button
              key={radius}
              aria-pressed={radiusKm === radius}
              variant={radiusKm === radius ? "secondary" : "ghost"}
              className="justify-between [@media(pointer:coarse)]:min-h-11"
              onPress={() => selectRadius(radius)}
            >
              {`${radius} km`}
              {radiusKm === radius ? <Check className="size-4 text-accent" aria-hidden /> : null}
            </Button>
          ))}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
