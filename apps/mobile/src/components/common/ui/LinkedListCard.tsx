import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useT } from "@/lib/i18n";
import { ListCard } from "./ListCard";

export function LinkedListCard({
  label,
  onPress,
  disabled,
  notificationCount,
  actions,
  leadingActions,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  notificationCount?: number;
  actions?: ReactNode;
  leadingActions?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <View style={{ position: "relative", width: "100%" }}>
      <ListCard>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={notificationCount ? { text: t("Unread updates") } : undefined}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
            padding: 12,
            minHeight: leadingActions ? 136 : undefined,
          }}
        >
          {children}
        </Pressable>
        {leadingActions ? (
          <View
            className="bg-surface"
            style={{
              position: "absolute",
              left: 12,
              top: 80,
              width: 64,
              alignItems: "center",
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
    </View>
  );
}
