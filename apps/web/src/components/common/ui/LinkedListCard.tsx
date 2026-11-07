"use client";

import { Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import Link from "next/link";
import type { ReactNode } from "react";
import { ListCard } from "./ListCard";

/** Horizontal HeroUI card; the stretched link never contains a popover trigger. */
export function LinkedListCard({
  href,
  label,
  disabled,
  notificationCount,
  onOpen,
  actions,
  leadingActions,
  artwork,
  children,
}: {
  href: string;
  label: string;
  disabled?: boolean;
  notificationCount?: number;
  onOpen?: () => void;
  actions?: ReactNode;
  leadingActions?: ReactNode;
  artwork: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <ListCard className="isolate flex-row items-start">
      <Link
        href={href}
        aria-label={label}
        aria-description={notificationCount ? t`Unread updates` : undefined}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault();
          else if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onOpen?.();
        }}
        className="absolute inset-0 rounded-xl hover:bg-default focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      />
      <Card.Content className="pointer-events-none relative flex min-w-0 flex-1 flex-row items-start gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          {children}
          {leadingActions || actions ? (
            <div className="pointer-events-auto relative flex w-fit max-w-full flex-wrap items-center gap-1">
              {leadingActions}
              {actions}
            </div>
          ) : null}
        </div>
        <div className="shrink-0">{artwork}</div>
      </Card.Content>
    </ListCard>
  );
}
