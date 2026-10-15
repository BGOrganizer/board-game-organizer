import { Tabs } from "heroui-native/tabs";
import type { ReactNode } from "react";

export function TabBar({ children }: { children: ReactNode }) {
  return (
    <Tabs.List style={{ marginBottom: 12 }}>
      <Tabs.Indicator />
      {children}
    </Tabs.List>
  );
}
