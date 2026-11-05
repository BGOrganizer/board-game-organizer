import { Tabs } from "heroui-native/tabs";
import type { ComponentProps } from "react";

export function TabTrigger({ style, ...props }: ComponentProps<typeof Tabs.Trigger>) {
  return (
    <Tabs.Trigger
      {...props}
      style={
        typeof style === "function"
          ? (state) => [{ minHeight: 44, flexShrink: 0 }, style(state)]
          : [{ minHeight: 44, flexShrink: 0 }, style]
      }
    />
  );
}
