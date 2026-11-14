import type { ReactNode } from "react";
import { floatingActionContentStyle } from "@/components/common/layout/floatingActionStyles";

export function ListPage({
  children,
  hasFloatingActions = false,
}: {
  children: ReactNode;
  hasFloatingActions?: boolean;
}) {
  return (
    <section
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-6"
      style={hasFloatingActions ? floatingActionContentStyle : undefined}
    >
      {children}
    </section>
  );
}
