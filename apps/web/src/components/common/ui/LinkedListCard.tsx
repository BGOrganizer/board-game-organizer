"use client";

import { Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import Link from "next/link";
import type { ReactNode } from "react";
import { ListCard } from "./ListCard";

/** Stretched navigation and informational controls stay siblings. */
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
  artworkLayout = "thumbnail",
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
  artworkLayout?: "thumbnail" | "cover";
}) {
  const { t } = useLingui();
  const cover = artworkLayout === "cover";
  return (
    <ListCard className={`isolate flex-row ${cover ? "overflow-hidden" : "items-start"}`}>
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
      <Card.Content
        className={`pointer-events-none relative flex min-w-0 flex-1 flex-row ${cover ? "items-stretch p-0" : "items-start gap-4 p-4"}`}
      >
        {cover ? (
          <div className="relative w-20 max-w-[80px] shrink-0 overflow-hidden">{artwork}</div>
        ) : null}
        <div
          className={cover ? "flex min-w-0 flex-1 flex-col gap-2 p-3" : "min-w-0 flex-1 space-y-2"}
        >
          {children}
          {leadingActions || actions ? (
            <div
              className={`pointer-events-auto relative flex max-w-full flex-wrap items-center ${cover ? "mt-auto w-full justify-end" : "w-fit gap-1"}`}
            >
              {leadingActions}
              {actions}
            </div>
          ) : null}
        </div>
        {cover ? null : <div className="shrink-0">{artwork}</div>}
      </Card.Content>
    </ListCard>
  );
}
