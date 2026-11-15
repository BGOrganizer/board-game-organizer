import type { ReactNode } from "react";
import { View } from "react-native";
import { TabBar } from "./TabBar";

export function MainTabBar({ children }: { children: ReactNode }) {
  return (
    <View style={{ alignSelf: "stretch", marginTop: 8, maxWidth: "100%" }}>
      <TabBar>{children}</TabBar>
    </View>
  );
}
