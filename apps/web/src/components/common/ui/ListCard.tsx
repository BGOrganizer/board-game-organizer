import { Card } from "@heroui/react";
import type { ReactNode } from "react";

/** Shared frame for linked list rows and non-interactive detail cards. */
export function ListCard({
  children,
  className = "",
  background,
}: {
  children: ReactNode;
  className?: string;
  background?: ReactNode;
}) {
  return (
    <Card className={`relative rounded-xl p-0 ${className}`}>
      {background ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
        >
          {background}
        </div>
      ) : null}
      {background ? (
        <Card.Content className="relative flex min-h-44 flex-col justify-end p-4 pt-16">
          <div className="space-y-2 rounded-xl bg-surface/95 p-3">{children}</div>
        </Card.Content>
      ) : (
        children
      )}
    </Card>
  );
}
