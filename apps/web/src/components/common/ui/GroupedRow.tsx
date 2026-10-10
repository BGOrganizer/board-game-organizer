import type { CSSProperties, ReactNode } from "react";

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
