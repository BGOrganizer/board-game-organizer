import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { View } from "react-native";

export function EmptyList({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 32 }}>
      <View importantForAccessibility="no-hide-descendants">{icon}</View>
      <Typography className="text-center text-muted">{children}</Typography>
    </View>
  );
}
