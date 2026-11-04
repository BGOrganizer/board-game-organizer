import { ListGroup } from "heroui-native/list-group";
import { Children, type ReactNode } from "react";
import type { ViewStyle } from "react-native";

export function GroupedList({
  children,
  style,
  segment,
}: {
  children: ReactNode;
  style?: ViewStyle;
  /** Consecutive virtualized cells retain one group's surface and outer corners. */
  segment?: { index: number; count: number };
}) {
  if (Children.toArray(children).length === 0) return null;
  const first = !segment || segment.index === 0;
  const last = !segment || segment.index === segment.count - 1;
  return (
    <ListGroup
      className={last ? undefined : "border-b border-muted/20"}
      style={{
        ...style,
        ...(!first ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}),
        ...(!last ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
      }}
    >
      {children}
    </ListGroup>
  );
}
