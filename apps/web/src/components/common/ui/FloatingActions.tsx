"use client";
import { Button } from "@heroui/react";
import Link from "next/link";
import type { ReactNode } from "react";

type FloatingActionsProps = {
  label: string;
  children: ReactNode;
  isDisabled?: boolean;
  left?: boolean;
  variant?: "primary" | "secondary";
} & ({ href: string; onPress?: never } | { href?: never; onPress: () => void });
export function FloatingActions({
  href,
  onPress,
  label,
  children,
  isDisabled = false,
  left = false,
  variant = "primary",
}: FloatingActionsProps) {
  const className = `button button--${variant} button--icon-only fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${left ? "left-4 sm:left-6" : "right-4 sm:right-6"}`;
  if (onPress)
    return (
      <Button
        isIconOnly
        variant={variant}
        aria-label={label}
        isDisabled={isDisabled}
        onPress={onPress}
        className={className}
      >
        {children}
      </Button>
    );
  return (
    <Link
      href={href}
      aria-label={label}
      aria-disabled={isDisabled || undefined}
      onClick={(event) => {
        if (isDisabled) event.preventDefault();
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
