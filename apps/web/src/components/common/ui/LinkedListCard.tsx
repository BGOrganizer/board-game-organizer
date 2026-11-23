"use client";

import Link from "next/link";
import {
  type CardNavigation,
  cardNavigationClassName,
  LinkedListCardLayout,
  type LinkedListCardLayoutProps,
} from "./LinkedListCardLayout";

export const renderWebCardNavigation: CardNavigation = ({
  href,
  label,
  description,
  disabled,
  onOpen,
}) => (
  <Link
    href={href}
    aria-label={label}
    aria-description={description}
    aria-disabled={disabled}
    tabIndex={disabled ? -1 : undefined}
    onClick={(event) => {
      if (disabled) event.preventDefault();
      else if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onOpen?.();
    }}
    className={cardNavigationClassName}
  />
);

/** Stretched navigation and informational controls stay siblings. */
export function LinkedListCard(props: LinkedListCardLayoutProps) {
  return <LinkedListCardLayout {...props} renderNavigation={renderWebCardNavigation} />;
}
