"use client";

import { Popover } from "@heroui/react";
import { CircleHelp, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function HelpPopover({
  label,
  title,
  className,
  triggerClassName = "",
  triggerVariant = "ghost",
  placement = "bottom start",
  icon: Icon = CircleHelp,
  tone = "muted",
  size = "default",
  indicator,
  children,
}: {
  label: string;
  title?: string;
  icon?: LucideIcon;
  tone?: "muted" | "warning" | "success" | "accent" | "danger";
  size?: "default" | "compact";
  className?: string;
  triggerClassName?: string;
  triggerVariant?: "ghost" | "primary" | "danger-soft";
  indicator?: ReactNode;
  placement?: ComponentProps<typeof Popover.Content>["placement"];
  children: ReactNode;
}) {
  const colors = {
    muted: "text-muted",
    warning: "text-warning-soft-foreground",
    success: "text-success-soft-foreground",
    accent: "text-accent-soft-foreground",
    danger: "text-danger-soft-foreground",
  };
  const variants = {
    ghost: "button--ghost",
    primary: "button--primary",
    "danger-soft": "button--danger-soft",
  };
  const color =
    triggerVariant === "primary"
      ? "text-accent-foreground"
      : triggerVariant === "danger-soft"
        ? "text-danger-soft-foreground"
        : colors[tone];
  const symbol = (
    <>
      <Icon className={size === "compact" ? "size-4" : "size-5"} aria-hidden="true" />
      {indicator}
    </>
  );
  return (
    <Popover>
      <Popover.Trigger
        aria-label={label}
        className={`button button--sm button--icon-only ${variants[triggerVariant]} relative inline-flex min-h-11 min-w-11 items-center justify-center ${color} ${size === "compact" ? "p-0" : triggerClassName}`}
      >
        {size === "compact" ? (
          <span
            className={`relative inline-flex size-7 items-center justify-center rounded-lg ${triggerClassName}`}
          >
            {symbol}
          </span>
        ) : (
          symbol
        )}
      </Popover.Trigger>
      <Popover.Content placement={placement} className={className}>
        <Popover.Dialog
          aria-label={title ? undefined : label}
          className="whitespace-normal break-words p-3 text-sm"
        >
          {title ? <Popover.Heading>{title}</Popover.Heading> : null}
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
