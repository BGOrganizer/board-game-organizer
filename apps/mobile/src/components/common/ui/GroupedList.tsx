import { ListGroup } from "heroui-native/list-group";
import { Children, type ReactNode } from "react";
import type { ViewStyle } from "react-native";

export function GroupedList({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  if (Children.toArray(children).length === 0) return null;
  return <ListGroup style={style}>{children}</ListGroup>;
}
