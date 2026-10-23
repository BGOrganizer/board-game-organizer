"use client";
import Link from "next/link";
import type { ReactNode } from "react";

export function FloatingActions({
  href,
  label,
  children,
  isDisabled = false,
  left = false,
}: {
  href: string;
  label: string;
  children: ReactNode;
  isDisabled?: boolean;
  left?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-disabled={isDisabled || undefined}
      onClick={(event) => {
        if (isDisabled) event.preventDefault();
      }}
      className={`button button--primary button--icon-only fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${left ? "left-4 sm:left-6" : "right-4 sm:right-6"}`}
    >
      {children}
    </Link>
  );
}
