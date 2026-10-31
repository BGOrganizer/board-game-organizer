import { Children, type ReactNode } from "react";

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
