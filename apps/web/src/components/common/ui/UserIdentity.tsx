"use client";

import { Avatar } from "@heroui/react";
import type { ReactNode } from "react";

export function UserIdentity({
  name,
  avatarUrl,
  secondary,
  badge,
  children,
}: {
  name: string;
  avatarUrl?: string | null;
  secondary?: string | null;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <span className="relative shrink-0">
        <Avatar size="sm">
          <Avatar.Image src={avatarUrl ?? undefined} alt="" />
          <Avatar.Fallback>{name.slice(0, 2)}</Avatar.Fallback>
        </Avatar>
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        {secondary ? (
          <span className="block truncate text-sm text-default-500">{secondary}</span>
        ) : null}
        {children}
      </span>
    </>
  );
}
