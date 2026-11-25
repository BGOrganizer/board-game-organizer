"use client";

import {
  groupDiscoveryRadiusInputSchema,
  groupDiscoveryRadiusPresetsKm,
} from "@board-game-organizer/schemas";
import { Button, Input, Label, Popover } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Check, ChevronDown, Ruler } from "lucide-react";
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
  const [draft, setDraft] = useState<string | null>(null);
  const custom = draft !== null;
  const value = `${radiusKm} km`;
  const parsed = groupDiscoveryRadiusInputSchema.safeParse(draft);
  const selectRadius = (radius: number) => {
    setOpen(false);
    setDraft(null);
    onChange(radius);
  };

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) setDraft(null);
      }}
    >
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
          {custom ? (
            <form
              className="space-y-2 p-1"
              onSubmit={(event) => {
                event.preventDefault();
                if (parsed.success) selectRadius(parsed.data);
              }}
            >
              <Label htmlFor="group-custom-distance">{t`Custom distance`}</Label>
              <Input
                id="group-custom-distance"
                inputMode="numeric"
                placeholder={t`1–100 km`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="w-full"
              />
              <div className="flex justify-between gap-2">
                <Button
                  aria-label={t`Back`}
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  onPress={() => setDraft(null)}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                </Button>
                <Button size="sm" type="submit" isDisabled={!parsed.success}>
                  {t`Apply`}
                </Button>
              </div>
            </form>
          ) : (
            <>
              {groupDiscoveryRadiusPresetsKm.map((radius) => (
                <Button
                  key={radius}
                  aria-pressed={radiusKm === radius}
                  variant={radiusKm === radius ? "secondary" : "ghost"}
                  className="justify-between [@media(pointer:coarse)]:min-h-11"
                  onPress={() => selectRadius(radius)}
                >
                  {`${radius} km`}
                  {radiusKm === radius ? (
                    <Check className="size-4 text-accent" aria-hidden />
                  ) : null}
                </Button>
              ))}
              <Button
                variant="ghost"
                className="justify-start [@media(pointer:coarse)]:min-h-11"
                onPress={() => setDraft(String(radiusKm))}
              >
                {t`Custom distance`}
              </Button>
            </>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
