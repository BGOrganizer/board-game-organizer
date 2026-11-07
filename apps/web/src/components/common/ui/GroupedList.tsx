import { Children, type CSSProperties, type ReactNode } from "react";

export function GroupedList({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  if (Children.toArray(children).length === 0) return null;
  return (
    <ul
      style={style}
      className={`overflow-hidden rounded-xl bg-surface divide-y divide-separator ${className}`}
    >
      {children}
    </ul>
  );
}
