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
      className={`divide-y divide-default-200 overflow-hidden rounded-xl border border-default-200 ${className}`}
    >
      {children}
    </ul>
  );
}

export function GroupedRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <li className={`flex min-w-0 items-center gap-3 p-3 ${className}`}>{children}</li>;
}
