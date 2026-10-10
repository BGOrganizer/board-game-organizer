"use client";

import { Popover } from "@heroui/react";
import { CircleHelp } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export function HelpPopover({
  label,
  title,
  className,
  placement = "bottom start",
  children,
}: {
  label: string;
  title?: string;
  className?: string;
  placement?: ComponentProps<typeof Popover.Content>["placement"];
  children: ReactNode;
}) {
  return (
    <Popover>
      <Popover.Trigger
        aria-label={label}
        className="inline-flex size-8 items-center justify-center rounded-full text-default-500 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <CircleHelp className="size-4" aria-hidden="true" />
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
