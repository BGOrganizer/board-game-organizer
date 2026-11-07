"use client";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleOff, Trophy } from "lucide-react";
export function EventTableRatingBadge({ enabled }: { enabled: boolean }) {
  const { t } = useLingui();
  const Icon = enabled ? Trophy : CircleOff;
  return (
    <Chip
      size="sm"
      variant={enabled ? "primary" : "secondary"}
      color={enabled ? "accent" : "default"}
      role="img"
      aria-label={enabled ? t`Rating enabled` : t`Rating disabled`}
    >
      <Icon className="size-3.5" aria-hidden />
      <Chip.Label>{t`Rating`}</Chip.Label>
    </Chip>
  );
}
