"use client";
import { Badge } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

export function NotificationCountBadge({
  count,
  corner = false,
  counted = false,
}: {
  count?: number;
  corner?: boolean;
  counted?: boolean;
}) {
  const { t } = useLingui();
  if (!count) return null;
  return (
    <Badge
      color="danger"
      size="sm"
      role="img"
      aria-label={counted ? `${t`Notifications`}: ${count}` : t`Needs attention`}
      style={{
        position: corner ? "absolute" : "relative",
        top: corner ? (counted ? -8 : -4) : undefined,
        right: corner ? (counted ? -8 : -4) : undefined,
        ...(!counted
          ? { width: 8, minWidth: 8, height: 8, minHeight: 8, padding: 0, borderRadius: 4 }
          : {}),
        transform: "none",
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      {counted ? (count > 99 ? "99+" : String(count)) : null}
    </Badge>
  );
}
