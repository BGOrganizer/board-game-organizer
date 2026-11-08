import { Card } from "heroui-native/card";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useT } from "@/lib/i18n";
import { ListCard } from "./ListCard";

/** Stretched navigation and informational controls stay siblings. */
export function LinkedListCard({
  label,
  onPress,
  disabled,
  notificationCount,
  actions,
  leadingActions,
  artwork,
  children,
  artworkLayout = "thumbnail",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  notificationCount?: number;
  actions?: ReactNode;
  leadingActions?: ReactNode;
  artwork: ReactNode;
  children: ReactNode;
  artworkLayout?: "thumbnail" | "cover";
}) {
  const t = useT();
  const cover = artworkLayout === "cover";
  return (
    <ListCard style={cover ? { overflow: "hidden" } : undefined}>
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
        style={{
          flexDirection: "row",
          alignItems: cover ? "stretch" : "flex-start",
          gap: cover ? 0 : 16,
          padding: cover ? 0 : 16,
        }}
      >
        {cover ? (
          <View
            pointerEvents="none"
            style={{ position: "relative", width: 80, flexShrink: 0, overflow: "hidden" }}
          >
            {artwork}
          </View>
        ) : null}
        <View
          pointerEvents="box-none"
          style={{ flex: 1, minWidth: 0, gap: 8, ...(cover ? { padding: 12 } : {}) }}
        >
          <View pointerEvents="none">{children}</View>
          {leadingActions || actions ? (
            <View
              pointerEvents="box-none"
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: cover ? 0 : 4,
                ...(cover ? { marginTop: "auto", justifyContent: "flex-end" } : {}),
              }}
            >
              {leadingActions}
              {actions}
            </View>
          ) : null}
        </View>
        {cover ? null : (
          <View pointerEvents="none" style={{ flexShrink: 0 }}>
            {artwork}
          </View>
        )}
      </Card.Body>
    </ListCard>
  );
}
