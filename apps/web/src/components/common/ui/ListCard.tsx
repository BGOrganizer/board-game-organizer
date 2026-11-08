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
    <Card className={`relative rounded-xl p-0 ${background ? "overflow-hidden" : ""} ${className}`}>
      {background ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
        >
          {background}
        </div>
      ) : null}
      {background ? (
        <Card.Content className="relative flex min-h-56 flex-col justify-end p-0 pt-16">
          {children}
        </Card.Content>
      ) : (
        children
      )}
    </Card>
  );
}
