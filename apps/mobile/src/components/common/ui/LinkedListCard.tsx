import { Card } from "heroui-native/card";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
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
  const controls = (
    <>
      {leadingActions}
      {actions}
    </>
  );
  const toolbar =
    leadingActions || actions ? (
      cover ? (
        <ScrollView
          horizontal
          style={{ height: 44, marginHorizontal: 12, marginBottom: 12, flexGrow: 0 }}
          contentContainerStyle={{
            flexGrow: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          {controls}
        </ScrollView>
      ) : (
        <View
          pointerEvents="box-none"
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}
        >
          {controls}
        </View>
      )
    ) : null;
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
          flexDirection: cover ? "column" : "row",
          alignItems: cover ? "stretch" : "flex-start",
          gap: cover ? 0 : 16,
          padding: cover ? 0 : 16,
        }}
      >
        {cover ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: 80,
              overflow: "hidden",
            }}
          >
            {artwork}
          </View>
        ) : null}
        <View
          pointerEvents="box-none"
          style={{
            minWidth: 0,
            gap: 8,
            ...(cover ? { padding: 12, marginLeft: 80 } : { flex: 1 }),
          }}
        >
          <View pointerEvents="none">{children}</View>
          {cover ? null : toolbar}
        </View>
        {cover ? toolbar : null}
        {cover ? null : (
          <View pointerEvents="none" style={{ flexShrink: 0 }}>
            {artwork}
          </View>
        )}
      </Card.Body>
    </ListCard>
  );
}
