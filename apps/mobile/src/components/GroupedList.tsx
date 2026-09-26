import { ListGroup } from "heroui-native/list-group";
import { Children, type ReactNode } from "react";

export function GroupedList({ children }: { children: ReactNode }) {
  if (Children.toArray(children).length === 0) return null;
  return <ListGroup>{children}</ListGroup>;
}

export function GroupedRow({ children }: { children: ReactNode }) {
  return (
    <ListGroup.Item
      accessible={false}
      className="border-b border-muted/20 last:border-b-0"
      style={{ padding: 12, paddingLeft: 16, gap: 8 }}
    >
      {children}
    </ListGroup.Item>
  );
}
