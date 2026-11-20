"use client";

import { Button } from "@heroui/react/button";
import { Popover } from "@heroui/react/popover";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const toneClass = {
  muted: "text-muted",
  accent: "text-accent-soft-foreground",
  success: "text-success-soft-foreground",
  warning: "text-warning-soft-foreground",
};

export function PreviewPopover({
  label,
  icon: Icon,
  tone = "muted",
  children,
}: {
  label: string;
  icon: LucideIcon;
  tone?: keyof typeof toneClass;
  children: ReactNode;
}) {
  return (
    <Popover>
      <Button
        slot={null}
        variant="ghost"
        size="sm"
        isIconOnly
        className={`min-h-11 min-w-11 p-0 ${toneClass[tone]}`}
        aria-label={label}
      >
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-default">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </Button>
      <Popover.Content placement="bottom start" className="w-[min(20rem,calc(100vw-2rem))]">
        <Popover.Dialog className="whitespace-normal break-words p-3 text-sm">
          <Popover.Heading>{label}</Popover.Heading>
          <div className="preview-popover-content">{children}</div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
