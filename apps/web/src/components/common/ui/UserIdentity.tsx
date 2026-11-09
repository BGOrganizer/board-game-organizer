"use client";

import { Avatar } from "@heroui/react";
import type { ReactNode } from "react";

export function UserIdentity({
  name,
  avatarUrl,
  secondary,
  badge,
  titleAccessory,
  children,
}: {
  name: string;
  avatarUrl?: string | null;
  secondary?: string | null;
  badge?: ReactNode;
  titleAccessory?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <span className={`relative shrink-0 ${badge ? "mr-3 mb-3" : ""}`}>
        <Avatar size="sm">
          <Avatar.Image src={avatarUrl ?? undefined} alt="" />
          <Avatar.Fallback>{name.replace(/^@/, "").slice(0, 2)}</Avatar.Fallback>
        </Avatar>
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium">{name}</span>
          {titleAccessory}
        </span>
        {secondary ? <span className="block truncate text-sm text-muted">{secondary}</span> : null}
        {children}
      </span>
    </>
  );
}
