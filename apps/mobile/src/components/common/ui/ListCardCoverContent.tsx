import { Card } from "heroui-native/card";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

/** Full-width heading with a single bottom action row that may extend over the artwork. */
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
          position: "relative",
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
          style={{ flex: 1, minWidth: 0, minHeight: 96, gap: 8, paddingBottom: controls ? 56 : 0 }}
        >
          <View pointerEvents="none" style={{ gap: 8 }}>
            {children}
          </View>
        </View>
        {controls ? (
          <ScrollView
            testID="card-controls"
            horizontal
            bounces={false}
            alwaysBounceHorizontal={false}
            pointerEvents={controlsDisabled ? "none" : "box-none"}
            accessibilityElementsHidden={controlsDisabled}
            importantForAccessibility={controlsDisabled ? "no-hide-descendants" : "auto"}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 48,
              flexGrow: 0,
              zIndex: 1,
            }}
            contentContainerStyle={{
              flexGrow: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 4,
              paddingVertical: 2,
            }}
          >
            {controls}
          </ScrollView>
        ) : null}
      </View>
    </Card.Body>
  );
}
