import { Card } from "heroui-native/card";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

/** The same contained artwork, text and control layout for live rows and factual drafts. */
export function ListCardCoverContent({
  artwork,
  children,
  controls,
  controlsDisabled = false,
}: {
  artwork: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
  controlsDisabled?: boolean;
}) {
  return (
    <Card.Body
      pointerEvents="box-none"
      style={{ flexDirection: "column", alignItems: "stretch", gap: 0, padding: 0 }}
    >
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
      {controls ? (
        <ScrollView
          horizontal
          pointerEvents={controlsDisabled ? "none" : "auto"}
          accessibilityElementsHidden={controlsDisabled}
          importantForAccessibility={controlsDisabled ? "no-hide-descendants" : "auto"}
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
      ) : null}
    </Card.Body>
  );
}
