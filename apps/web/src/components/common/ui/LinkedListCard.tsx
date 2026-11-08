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
  const controls = (
    <>
      {leadingActions}
      {actions}
    </>
  );
  const toolbar =
    leadingActions || actions ? (
      <div
        className={
          cover
            ? "pointer-events-auto relative mx-2 mb-2 overflow-x-auto overscroll-x-contain p-1"
            : "pointer-events-auto relative flex w-fit max-w-full flex-wrap items-center gap-1"
        }
      >
        {cover ? (
          <div className="flex w-max min-w-full flex-nowrap items-center justify-end [&>*]:shrink-0">
            {controls}
          </div>
        ) : (
          controls
        )}
      </div>
    ) : null;
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
        className={`pointer-events-none relative flex min-w-0 flex-1 ${cover ? "flex-col p-0" : "flex-row items-start gap-4 p-4"}`}
      >
        {cover ? (
          <div className="absolute inset-y-0 left-0 w-20 max-w-[80px] overflow-hidden">
            {artwork}
          </div>
        ) : null}
        <div className={cover ? "relative ml-[80px] min-w-0 p-3" : "min-w-0 flex-1 space-y-2"}>
          {children}
          {cover ? null : toolbar}
        </div>
        {cover ? toolbar : null}
        {cover ? null : <div className="shrink-0">{artwork}</div>}
      </Card.Content>
    </ListCard>
  );
}
