import { Card } from "@heroui/react";
import type { ReactNode } from "react";

/** Shared frame for linked list rows and non-interactive detail cards. */
export function ListCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Card className={`relative rounded-xl p-0 ${className}`}>{children}</Card>;
}
