import { Text } from "heroui-native/text";
import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Compact tab screen shell: replaces the bulky native navigation header
 * (big top inset + padding) with a tight title bar right below the status
 * bar. `centered` centers the children in the remaining space (placeholders).
 */
export function TabScreen({
  title,
  children,
  centered = false,
}: {
  title: string;
  children: ReactNode;
  centered?: boolean;
}) {
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className="px-4 pb-2 pt-1">
        <Text className="text-xl font-bold">{title}</Text>
      </View>
      <View className={centered ? "flex-1 items-center justify-center" : "flex-1"}>{children}</View>
    </SafeAreaView>
  );
}
