import { Card } from "heroui-native/card";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useT } from "@/lib/i18n";
import { ListCard } from "./ListCard";
import { ListCardCoverContent } from "./ListCardCoverContent";

/** Stretched navigation and informational controls stay siblings. */
export function LinkedListCard({
  label,
  onPress,
  disabled,
  controlsDisabled = false,
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
  controlsDisabled?: boolean;
  notificationCount?: number;
  actions?: ReactNode;
  leadingActions?: ReactNode;
  artwork: ReactNode;
  children: ReactNode;
  artworkLayout?: "thumbnail" | "cover";
}) {
  const t = useT();
  const cover = artworkLayout === "cover";
  const controls =
    leadingActions || actions ? (
      <>
        {leadingActions}
        {actions}
      </>
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
      {cover ? (
        <ListCardCoverContent
          artwork={artwork}
          controls={controls}
          controlsDisabled={controlsDisabled}
        >
          {children}
        </ListCardCoverContent>
      ) : (
        <Card.Body
          pointerEvents="box-none"
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 16, padding: 16 }}
        >
          <View pointerEvents="box-none" style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <View pointerEvents="none">{children}</View>
            {controls ? (
              <View
                pointerEvents={controlsDisabled ? "none" : "box-none"}
                accessibilityElementsHidden={controlsDisabled}
                importantForAccessibility={controlsDisabled ? "no-hide-descendants" : "auto"}
                style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}
              >
                {controls}
              </View>
            ) : null}
          </View>
          <View pointerEvents="none" style={{ flexShrink: 0 }}>
            {artwork}
          </View>
        </Card.Body>
      )}
    </ListCard>
  );
}
