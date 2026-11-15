import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";

export const listPageContentStyle: ViewStyle = { padding: 20, gap: 12, flexGrow: 1 };

export function ListPage({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
