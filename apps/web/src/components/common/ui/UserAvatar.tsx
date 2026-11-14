"use client";

import { Avatar } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

export function UserAvatar({
  name,
  avatarUrl,
  size = "sm",
  online,
  badge,
  topBadge,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  online?: boolean;
  badge?: ReactNode;
  topBadge?: ReactNode;
}) {
  const { t } = useLingui();
  const pixels = { sm: 32, md: 40, lg: 48 }[size];
  const dual = Boolean(badge && topBadge);
  const offset = dual ? -(44 - pixels / 2) : -20;
  return (
    <span
      className="relative isolate inline-flex shrink-0"
      style={{
        marginRight: badge || topBadge ? 12 : 0,
        marginTop: dual ? (64 - pixels) / 2 : topBadge ? 12 : 0,
        marginBottom: dual ? (64 - pixels) / 2 : badge ? 12 : 0,
      }}
    >
      <Avatar size={size} className="z-0">
        <Avatar.Image src={avatarUrl ?? undefined} alt="" />
        <Avatar.Fallback>{name.replace(/^@/, "").slice(0, 2)}</Avatar.Fallback>
      </Avatar>
      {online !== undefined ? (
        <span
          role="img"
          aria-label={online ? t`Online` : t`Offline`}
          title={online ? t`Online` : t`Offline`}
          className={`absolute -top-px z-10 size-2.5 rounded-full border-2 border-surface ${online ? "bg-success" : "bg-muted"} ${topBadge ? "-left-px" : "-right-px"}`}
        />
      ) : null}
      {badge ? (
        <span className="absolute z-20" style={{ right: -20, bottom: offset }}>
          {badge}
        </span>
      ) : null}
      {topBadge ? (
        <span className="absolute z-20" style={{ right: -20, top: offset }}>
          {topBadge}
        </span>
      ) : null}
    </span>
  );
}
