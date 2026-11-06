import { Card } from "heroui-native/card";
import type { ComponentProps, ReactNode } from "react";

/** Shared frame; navigation and detail interactions stay with their owners. */
export function ListCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: ComponentProps<typeof Card>["style"];
}) {
  return (
    <Card style={[{ width: "100%", borderRadius: 12, position: "relative", padding: 0 }, style]}>
      {children}
    </Card>
  );
}
