"use client";

import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarCheck, Clock3, Flag } from "lucide-react";

export function EventStatusBadge({ status }: { status: PlannedEventResponse["status"] }) {
  const { t } = useLingui();
  const planning = status === "PLANNING";
  const confirmed = status === "CONFIRMED";
  const Icon = planning ? Clock3 : confirmed ? CalendarCheck : Flag;
  return (
    <Chip size="sm" variant="soft" color={planning ? "warning" : confirmed ? "success" : "default"}>
      <Icon className="size-3.5" aria-hidden />
      <Chip.Label>{planning ? t`Planning` : confirmed ? t`Confirmed` : t`Terminated`}</Chip.Label>
    </Chip>
  );
}
