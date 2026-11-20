"use client";

import { Avatar } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { CSSProperties, ReactNode } from "react";

export function UserAvatar({
  name,
  avatarUrl,
  avatarContent,
  size = "sm",
  online,
  badge,
  topBadge,
  style,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarContent?: ReactNode;
  size?: "sm" | "md" | "lg";
  online?: boolean;
  badge?: ReactNode;
  topBadge?: ReactNode;
  style?: CSSProperties;
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
        ...style,
      }}
    >
      <Avatar size={size} className="z-0">
        {avatarContent ?? <Avatar.Image src={avatarUrl ?? undefined} alt="" />}
        <Avatar.Fallback>{name.replace(/^@/, "").slice(0, 2) || "?"}</Avatar.Fallback>
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
        <span
          className="absolute z-20 flex size-11 items-center justify-center"
          style={{ right: -20, bottom: offset }}
        >
          {badge}
        </span>
      ) : null}
      {topBadge ? (
        <span
          className="absolute z-20 flex size-11 items-center justify-center"
          style={{ right: -20, top: offset }}
        >
          {topBadge}
        </span>
      ) : null}
    </span>
  );
}
