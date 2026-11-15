"use client";
import { Tabs } from "@heroui/react";
import type { ReactNode } from "react";

/** Compact application tabs: center when they fit, scroll at the available width. */
export function TabBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tabs.ListContainer className="mt-2 w-fit max-w-full self-center">
      <Tabs.List aria-label={label}>{children}</Tabs.List>
    </Tabs.ListContainer>
  );
}
