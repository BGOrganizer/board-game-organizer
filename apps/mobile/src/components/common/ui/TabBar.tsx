import { Tabs } from "heroui-native/tabs";
import type { ReactNode } from "react";
import type { ViewStyle } from "react-native";

export function TabBar({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <Tabs.List style={[{ marginBottom: 12 }, style]}>
      <Tabs.Indicator />
      {children}
    </Tabs.List>
  );
}
