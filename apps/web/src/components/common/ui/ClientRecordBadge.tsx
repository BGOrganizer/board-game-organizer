"use client";
import type { ClientRecordState } from "@board-game-organizer/shared";
import { Chip } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CircleAlert, Clock3, Save } from "lucide-react";

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

export function ClientRecordBadge({
  phase,
  iconOnly = false,
}: {
  phase?: ClientRecordState["phase"];
  iconOnly?: boolean;
}) {
  const { t } = useLingui();
  const label =
      phase === "failed" ? t`Not saved` : phase === "verifying" ? t`Verifying` : t`Saving`,
    failed = phase === "failed",
    Icon = failed ? CircleAlert : phase === "verifying" ? Clock3 : Save;
  const badge = phase ? (
    <Chip
      size="sm"
      variant="soft"
      color={failed ? "danger" : "warning"}
      role="status"
      aria-label={label}
      className={iconOnly ? "size-6 min-w-6 justify-center p-0" : undefined}
    >
      <Icon className="size-3.5" aria-hidden />
      {iconOnly ? null : <Chip.Label>{label}</Chip.Label>}
    </Chip>
  ) : null;
  // Keep the title width stable when the saving badge appears or disappears.
  return iconOnly ? (
    <span className="inline-flex size-6 shrink-0 self-start" aria-hidden={!phase || undefined}>
      {badge}
    </span>
  ) : (
    badge
  );
}
