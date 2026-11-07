"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { HelpPopover } from "@/components/common/ui/HelpPopover";

export function InfoSection({
  label,
  helpLabel,
  help,
  icon: Icon,
  headerAccessory,
  children,
}: {
  label: string;
  helpLabel: string;
  help: string;
  icon: LucideIcon;
  headerAccessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2" aria-label={label}>
      <div className="flex items-center gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 shrink-0" aria-hidden />
          {label}
        </h2>
        <HelpPopover label={helpLabel} title={label}>
          {help}
        </HelpPopover>
        {headerAccessory ? <div className="ml-auto shrink-0">{headerAccessory}</div> : null}
      </div>
      <GroupedList>{children}</GroupedList>
    </section>
  );
}
