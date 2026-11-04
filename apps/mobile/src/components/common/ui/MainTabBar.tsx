import type { ReactNode } from "react";
import { View } from "react-native";
import { TabBar } from "./TabBar";

/** Shared geometry for main Groups, Events and Contacts; detail/picker tabs stay independent. */
export function MainTabBar({
  children,
  scrollable = false,
}: {
  children: ReactNode;
  scrollable?: boolean;
}) {
  return (
    <View
      style={{
        alignSelf: "center",
        marginTop: 8,
        maxWidth: "100%",
        ...(scrollable ? { width: "100%" } : {}),
      }}
    >
      <TabBar scrollable={scrollable}>{children}</TabBar>
    </View>
  );
}
