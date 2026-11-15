"use client";

import { Card } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import Link from "next/link";
import type { ReactNode } from "react";
import { ListCard } from "./ListCard";
import { ListCardCoverContent } from "./ListCardCoverContent";

/** Stretched navigation and informational controls stay siblings. */
export function LinkedListCard({
  href,
  label,
  disabled,
  controlsDisabled = false,
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
  controlsDisabled?: boolean;
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
  const controls =
    leadingActions || actions ? (
      <>
        {leadingActions}
        {actions}
      </>
    ) : null;
  return (
    <ListCard className={`isolate flex-row ${cover ? "overflow-hidden" : "items-start"}`}>
      <Link
        href={href}
        aria-label={label}
        aria-description={notificationCount ? t`Unread updates` : undefined}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
        onClick={(event) => {
          if (disabled) event.preventDefault();
          else if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onOpen?.();
        }}
        className="absolute inset-0 rounded-xl hover:bg-default focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      />
      {cover ? (
        <ListCardCoverContent
          artwork={artwork}
          controls={controls}
          controlsDisabled={controlsDisabled}
        >
          {children}
        </ListCardCoverContent>
      ) : (
        <Card.Content className="pointer-events-none relative flex min-w-0 flex-1 flex-row items-start gap-4 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            {children}
            {controls ? (
              <div
                inert={controlsDisabled}
                onClickCapture={(event) => {
                  if (controlsDisabled) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                className="pointer-events-auto relative flex w-fit max-w-full flex-wrap items-center gap-1"
              >
                {controls}
              </div>
            ) : null}
          </div>
          <div className="shrink-0">{artwork}</div>
        </Card.Content>
      )}
    </ListCard>
  );
}
