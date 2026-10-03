import { Children, type CSSProperties, type ReactNode } from "react";

export function GroupedList({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  if (Children.toArray(children).length === 0) return null;
  return (
    <ul
      className={`overflow-hidden rounded-xl bg-surface divide-y divide-default-200 ${className}`}
    >
      {children}
    </ul>
  );
}

export function GroupedRow({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <li style={style} className={`flex min-w-0 items-center gap-2 p-3 pl-4 ${className}`}>
      {children}
    </li>
  );
}
