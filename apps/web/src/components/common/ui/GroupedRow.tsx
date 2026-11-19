import type { CSSProperties, ReactNode } from "react";

export function GroupedRow({
  children,
  className = "",
  style,
  as: Element = "li",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: "li" | "div";
}) {
  return (
    <Element
      style={style}
      className={`relative flex min-w-0 items-center gap-2 p-3 pl-4 ${className}`}
    >
      {children}
    </Element>
  );
}
