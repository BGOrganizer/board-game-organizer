import { Card } from "heroui-native/card";
import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native";

/** Shared frame; navigation and detail interactions stay with their owners. */
export function ListCard({
  children,
  style,
  background,
}: {
  children: ReactNode;
  style?: ComponentProps<typeof Card>["style"];
  background?: ReactNode;
}) {
  return (
    <Card style={[{ width: "100%", borderRadius: 12, position: "relative", padding: 0 }, style]}>
      {background ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 12 }}
        >
          {background}
        </View>
      ) : null}
      {background ? (
        <Card.Body
          style={{ minHeight: 172, padding: 16, paddingTop: 64, justifyContent: "flex-end" }}
        >
          <View className="bg-surface/95" style={{ borderRadius: 12, padding: 12, gap: 8 }}>
            {children}
          </View>
        </Card.Body>
      ) : (
        children
      )}
    </Card>
  );
}
