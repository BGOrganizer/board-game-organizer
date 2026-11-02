"use client";

import { Badge } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

/** Presentation only. Reading/consent belongs to the source workflow, never this marker. */
export function NotificationUnreadDot({ active }: { active: boolean }) {
  const { t } = useLingui();
  if (!active) return null;
  return (
    <Badge
      color="accent"
      size="sm"
      role="img"
      aria-label={t`Unread updates`}
      className="shrink-0 pointer-events-none"
      style={{
        position: "relative",
        transform: "none",
        width: 8,
        minWidth: 8,
        height: 8,
        minHeight: 8,
        padding: 0,
        borderRadius: 4,
      }}
    />
  );
}
