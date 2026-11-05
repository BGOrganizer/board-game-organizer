import { ListGroup } from "heroui-native/list-group";
import { Separator } from "heroui-native/separator";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import type { ViewStyle } from "react-native";

export function GroupedList({
  children,
  style,
  segment,
}: {
  children: ReactNode;
  style?: ViewStyle;
  segment?: { index: number; count: number };
}) {
  const rows = Children.toArray(children);
  if (!rows.length) return null;
  const first = !segment || segment.index === 0;
  const last = !segment || segment.index === segment.count - 1;
  return (
    <ListGroup
      style={{
        ...style,
        padding: 0,
        boxShadow: "none",
        ...(!first ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}),
        ...(!last ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
      }}
    >
      {rows.map((row, index) => (
        <Fragment key={isValidElement(row) ? row.key : index}>
          {row}
          {index < rows.length - 1 || !last ? <Separator /> : null}
        </Fragment>
      ))}
    </ListGroup>
  );
}
