"use client";

import { Card } from "@heroui/react";
import Link from "next/link";
import type { ReactNode } from "react";

export function LinkedListCard({
  href,
  label,
  disabled,
  actions,
  children,
}: {
  href: string;
  label: string;
  disabled?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="relative rounded-xl p-0">
      <Link
        href={href}
        aria-label={label}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
        className="flex w-full cursor-pointer items-start gap-3 p-3 text-left"
      >
        {children}
      </Link>
      {actions ? (
        <div className="absolute right-2 bottom-2 z-10 flex gap-1 rounded-lg bg-surface p-0.5">
          {actions}
        </div>
      ) : null}
    </Card>
  );
}
