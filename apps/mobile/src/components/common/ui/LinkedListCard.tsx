import { Card } from "heroui-native/card";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useT } from "@/lib/i18n";
import { ListCard } from "./ListCard";

/** Horizontal HeroUI card; navigation and informational actions are siblings. */
export function LinkedListCard({
  label,
  onPress,
  disabled,
  notificationCount,
  actions,
  leadingActions,
  artwork,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  notificationCount?: number;
  actions?: ReactNode;
  leadingActions?: ReactNode;
  artwork: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <ListCard>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={notificationCount ? { text: t("Unread updates") } : undefined}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={StyleSheet.absoluteFill}
      />
      <Card.Body
        pointerEvents="box-none"
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 16, padding: 16 }}
      >
        <View pointerEvents="box-none" style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <View pointerEvents="none">{children}</View>
          {leadingActions || actions ? (
            <View
              pointerEvents="box-none"
              style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}
            >
              {leadingActions}
              {actions}
            </View>
          ) : null}
        </View>
        <View pointerEvents="none" style={{ flexShrink: 0 }}>
          {artwork}
        </View>
      </Card.Body>
    </ListCard>
  );
}
