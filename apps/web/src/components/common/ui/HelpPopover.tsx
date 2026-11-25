"use client";

import { Button, Popover } from "@heroui/react";
import { CircleHelp, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function HelpPopover({
  label,
  title,
  titleClassName,
  titleIcon,
  className,
  triggerClassName = "",
  triggerVariant = "ghost",
  placement = "bottom start",
  icon: Icon = CircleHelp,
  tone = "muted",
  size = "default",
  indicator,
  onOpenChange,
  children,
}: {
  label: string;
  title?: string;
  titleClassName?: string;
  titleIcon?: ReactNode;
  icon?: LucideIcon;
  tone?: "muted" | "warning" | "success" | "accent" | "danger";
  size?: "default" | "compact";
  className?: string;
  triggerClassName?: string;
  triggerVariant?: "ghost" | "primary" | "danger-soft" | "danger";
  indicator?: ReactNode;
  onOpenChange?: (open: boolean) => void;
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
  const color =
    triggerVariant === "primary"
      ? "text-accent-foreground"
      : triggerVariant === "danger-soft"
        ? "text-danger-soft-foreground"
        : triggerVariant === "danger"
          ? "text-danger-foreground"
          : colors[tone];
  const compactSurface = {
    ghost: triggerClassName,
    primary: "bg-accent",
    "danger-soft": "bg-danger-soft",
    danger: "bg-danger",
  }[triggerVariant];
  const symbol = (
    <>
      <Icon className={size === "compact" ? "size-4" : "size-5"} aria-hidden="true" />
      {indicator}
    </>
  );
  return (
    <Popover onOpenChange={onOpenChange}>
      <Button
        slot={null}
        isIconOnly
        size="sm"
        variant={size === "compact" ? "ghost" : triggerVariant}
        aria-label={label}
        className={`relative min-h-11 min-w-11 ${color} ${size === "compact" ? "p-0" : triggerClassName}`}
      >
        {size === "compact" ? (
          <span
            className={`relative inline-flex size-7 items-center justify-center rounded-lg ${compactSurface}`}
          >
            {symbol}
          </span>
        ) : (
          symbol
        )}
      </Button>
      <Popover.Content placement={placement} className={className}>
        <Popover.Dialog
          aria-label={title ? undefined : label}
          className="whitespace-normal break-words p-3 text-sm"
        >
          {title ? (
            <Popover.Heading
              className={
                titleIcon ? `flex items-center gap-2 ${titleClassName ?? ""}` : titleClassName
              }
            >
              {titleIcon}
              {title}
            </Popover.Heading>
          ) : null}
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
