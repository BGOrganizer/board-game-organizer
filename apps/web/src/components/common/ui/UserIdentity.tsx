"use client";

import type { ReactNode } from "react";
import { UserAvatar } from "./UserAvatar";

export function UserIdentity({
  name,
  avatarUrl,
  secondary,
  badge,
  topBadge,
  titleAccessory,
  children,
}: {
  name: string;
  avatarUrl?: string | null;
  secondary?: string | null;
  badge?: ReactNode;
  topBadge?: ReactNode;
  titleAccessory?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <UserAvatar name={name} avatarUrl={avatarUrl} badge={badge} topBadge={topBadge} />
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
