import { Tabs } from "heroui-native/tabs";
import type { ReactNode } from "react";
import type { ViewStyle } from "react-native";

export function TabBar({
  children,
  style,
  scrollable = false,
}: {
  children: ReactNode;
  style?: ViewStyle;
  scrollable?: boolean;
}) {
  const content = (
    <>
      <Tabs.Indicator />
      {children}
    </>
  );
  return (
    <Tabs.List style={[{ marginBottom: 12 }, style]}>
      {scrollable ? <Tabs.ScrollView>{content}</Tabs.ScrollView> : content}
    </Tabs.List>
  );
}
