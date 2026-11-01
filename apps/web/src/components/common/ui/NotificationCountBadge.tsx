"use client";
import { Badge } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function NotificationCountBadge({
  count,
  corner = false,
}: {
  count?: number;
  corner?: boolean;
}) {
  const { t } = useLingui();
  if (!count) return null;
  return (
    <Badge
      color="danger"
      size="sm"
      role="img"
      aria-label={`${t`Notifications`}: ${count}`}
      style={{
        position: corner ? "absolute" : "relative",
        top: corner ? -8 : undefined,
        right: corner ? -8 : undefined,
        transform: "none",
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      {count > 99 ? "99+" : String(count)}
    </Badge>
  );
}
