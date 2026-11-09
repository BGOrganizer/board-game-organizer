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
            pointerEvents="box-none"
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 16,
              padding: 16,
              paddingBottom: 0,
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: "relative",
                width: 96,
                height: 96,
                flexShrink: 0,
                overflow: "hidden",
                borderRadius: 8,
              }}
            >
              {artwork}
            </View>
            <View pointerEvents="none" style={{ flex: 1, minWidth: 0, gap: 8 }}>
              {children}
            </View>
          </View>
        ) : (
          <View pointerEvents="box-none" style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <View pointerEvents="none">{children}</View>
            {toolbar}
          </View>
        )}
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
