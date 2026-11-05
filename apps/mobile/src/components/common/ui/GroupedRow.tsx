import { ListGroup } from "heroui-native/list-group";
import type { ReactNode } from "react";

export function GroupedRow({ children }: { children: ReactNode }) {
  return (
    <ListGroup.Item accessible={false} style={{ padding: 12, paddingLeft: 16, gap: 8 }}>
      {children}
    </ListGroup.Item>
  );
}
