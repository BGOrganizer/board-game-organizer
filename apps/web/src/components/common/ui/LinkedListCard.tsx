"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ListCard } from "./ListCard";
import { NotificationAttentionBorder } from "./NotificationAttentionBorder";

export function LinkedListCard({
  href,
  label,
  disabled,
  notificationCount,
  onOpen,
  actions,
  leadingActions,
  children,
}: {
  href: string;
  label: string;
  disabled?: boolean;
  notificationCount?: number;
  onOpen?: () => void;
  actions?: ReactNode;
  leadingActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative min-w-0">
      <ListCard>
        <Link
          href={href}
          aria-label={label}
          aria-disabled={disabled}
          onClick={(event) => {
            if (disabled) event.preventDefault();
            else if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
              onOpen?.();
          }}
          className="flex w-full cursor-pointer items-start gap-3 rounded-xl p-3 text-left hover:bg-default focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          {children}
        </Link>
        {leadingActions ? (
          <div className="absolute left-2 bottom-2 z-10 flex gap-1 rounded-lg bg-surface p-0.5">
            {leadingActions}
          </div>
        ) : null}
        {actions ? (
          <div className="absolute right-2 bottom-2 z-10 flex gap-1 rounded-lg bg-surface p-0.5">
            {actions}
          </div>
        ) : null}
      </ListCard>
      <NotificationAttentionBorder active={Boolean(notificationCount)} />
    </div>
  );
}
