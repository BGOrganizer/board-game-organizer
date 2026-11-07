"use client";
import type { ClientRecordState } from "@board-game-organizer/shared";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleAlert, Clock3 } from "lucide-react";

export function useClientRecordStatus(phase?: ClientRecordState["phase"]) {
  const { t } = useLingui();
  return !phase
    ? ""
    : phase === "failed"
      ? t`Not saved. Edit draft`
      : phase === "verifying"
        ? t`Checking saved changes`
        : t`Saving`;
}

export function ClientRecordBadge({ phase }: { phase: ClientRecordState["phase"] }) {
  const { t } = useLingui();
  const label =
      phase === "failed" ? t`Not saved` : phase === "verifying" ? t`Verifying` : t`Saving`,
    failed = phase === "failed",
    Icon = failed ? CircleAlert : Clock3;
  return (
    <Chip size="sm" variant="soft" color={failed ? "danger" : "warning"}>
      <Icon className="size-3.5" aria-hidden />
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}
