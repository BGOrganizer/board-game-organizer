import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ListCard } from "./ListCard";

export function LinkedListCard({
  label,
  onPress,
  disabled,
  actions,
  leadingActions,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  actions?: ReactNode;
  leadingActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ListCard>
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
      {leadingActions ? (
        <View
          className="bg-surface"
          style={{
            position: "absolute",
            left: 6,
            bottom: 6,
            flexDirection: "row",
            gap: 8,
            padding: 2,
            borderRadius: 8,
            zIndex: 1,
          }}
        >
          {leadingActions}
        </View>
      ) : null}
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
    </ListCard>
  );
}
