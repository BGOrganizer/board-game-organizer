import { Card } from "heroui-native/card";
import type { ReactNode } from "react";

/** Shared frame; navigation and detail interactions stay with their owners. */
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <Card style={{ width: "100%", borderRadius: 12, position: "relative", padding: 0 }}>
      {children}
    </Card>
  );
}
