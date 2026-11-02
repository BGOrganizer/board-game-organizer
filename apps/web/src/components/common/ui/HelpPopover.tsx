"use client";

import { Popover } from "@heroui/react";
import { CircleHelp, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function HelpPopover({
  label,
  title,
  className,
  placement = "bottom start",
  icon: Icon = CircleHelp,
  tone = "muted",
  children,
}: {
  label: string;
  title?: string;
  icon?: LucideIcon;
  tone?: "muted" | "warning" | "success";
  className?: string;
  placement?: ComponentProps<typeof Popover.Content>["placement"];
  children: ReactNode;
}) {
  const colors = {
    muted: "text-muted",
    warning: "text-warning-soft-foreground",
    success: "text-success-soft-foreground",
  };
  return (
    <Popover>
      <Popover.Trigger
        aria-label={label}
        className={`button button--sm button--icon-only button--ghost inline-flex min-h-11 min-w-11 items-center justify-center ${colors[tone]}`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content placement={placement} className={className}>
        <Popover.Dialog className="whitespace-normal break-words p-3 text-sm">
          {title ? <Popover.Heading>{title}</Popover.Heading> : null}
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
