import { ListGroup } from "heroui-native/list-group";
import { Children, type ReactNode } from "react";

export function GroupedList({ children }: { children: ReactNode }) {
  if (Children.toArray(children).length === 0) return null;
  return <ListGroup>{children}</ListGroup>;
}
