import { Card } from "heroui-native/card";
import type { ReactNode } from "react";
import { View } from "react-native";

/** Full-width heading above bottom-aligned artwork, facts and visible wrapping controls. */
export function ListCardCoverContent({
  artwork,
  heading,
  children,
  controls,
  controlsDisabled = false,
}: {
  artwork: ReactNode;
  heading?: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
  controlsDisabled?: boolean;
}) {
  return (
    <Card.Body
      pointerEvents="box-none"
      style={{ flexDirection: "column", alignItems: "stretch", gap: 12, padding: 16 }}
    >
      {heading ? (
        <View pointerEvents="none" style={{ minWidth: 0 }}>
          {heading}
        </View>
      ) : null}
      <View
        testID="card-body-row"
        pointerEvents="box-none"
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 16,
        }}
      >
        <View
          testID="card-artwork"
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
        <View
          testID="card-facts"
          pointerEvents="box-none"
          style={{ flex: 1, minWidth: 0, minHeight: 96, gap: 8 }}
        >
          <View pointerEvents="none" style={{ gap: 8 }}>
            {children}
          </View>
          {controls ? (
            <View
              testID="card-controls"
              pointerEvents={controlsDisabled ? "none" : "box-none"}
              accessibilityElementsHidden={controlsDisabled}
              importantForAccessibility={controlsDisabled ? "no-hide-descendants" : "auto"}
              style={{
                marginTop: "auto",
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 4,
              }}
            >
              {controls}
            </View>
          ) : null}
        </View>
      </View>
    </Card.Body>
  );
}
