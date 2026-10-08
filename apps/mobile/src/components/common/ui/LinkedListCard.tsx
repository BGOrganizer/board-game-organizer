import { Card } from "heroui-native/card";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

export function LinkedListCard({
  label,
  onPress,
  disabled,
  actions,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card style={{ width: "100%", borderRadius: 12, position: "relative" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 12 }}
      >
        {children}
      </Pressable>
      {actions ? (
        <View
          className="bg-surface"
          style={{
            position: "absolute",
            right: 6,
            bottom: 6,
            flexDirection: "row",
            gap: 8,
            padding: 2,
            borderRadius: 8,
            zIndex: 1,
          }}
        >
          {actions}
        </View>
      ) : null}
    </Card>
  );
}
