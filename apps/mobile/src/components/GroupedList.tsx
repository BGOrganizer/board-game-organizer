import { ListGroup } from "heroui-native/list-group";
import { Children, type ReactNode } from "react";

export function GroupedList({ children }: { children: ReactNode }) {
  if (Children.toArray(children).length === 0) return null;
  return (
    <ListGroup variant="transparent" style={{ borderRadius: 0, overflow: "visible" }}>
      {children}
    </ListGroup>
  );
}

export function GroupedRow({ children }: { children: ReactNode }) {
  return (
    <ListGroup.Item
      accessible={false}
      className="border-b border-muted/20 bg-surface last:border-b-0"
    >
      {children}
    </ListGroup.Item>
  );
}
