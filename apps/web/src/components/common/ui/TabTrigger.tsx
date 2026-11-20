"use client";

import { Tabs } from "@heroui/react";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

export function TabTrigger({
  icon: Icon,
  children,
  className,
  ...props
}: ComponentProps<typeof Tabs.Tab> & { icon: LucideIcon }) {
  return (
    <Tabs.Tab
      {...props}
      className={["flex-row gap-2 whitespace-nowrap", className].filter(Boolean).join(" ")}
    >
      {(state) => (
        <>
          <Icon className="size-4 shrink-0" aria-hidden />
          {typeof children === "function" ? children(state) : children}
          <Tabs.Indicator />
        </>
      )}
    </Tabs.Tab>
  );
}
