import { ListGroup } from "heroui-native/list-group";
import type { ReactNode } from "react";

export function GroupedRow({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <ListGroup.Item
      testID={testID}
      accessible={false}
      style={{ padding: 12, paddingLeft: 16, gap: 8 }}
    >
      {children}
    </ListGroup.Item>
  );
}
