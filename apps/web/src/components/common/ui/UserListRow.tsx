"use client";

import type { ComponentProps, ReactNode } from "react";
import { GroupedRow } from "./GroupedRow";
import { UserIdentity } from "./UserIdentity";

/** Application user identity and separate actions, shared by lists and pickers. */
export function UserListRow({
  actions,
  className,
  as,
  ...identity
}: ComponentProps<typeof UserIdentity> & {
  actions?: ReactNode;
  className?: string;
  as?: "li" | "div";
}) {
  return (
    <GroupedRow as={as} className={className}>
      <UserIdentity {...identity} />
      {actions ? (
        <div className="flex max-w-36 shrink-0 empty:hidden flex-wrap items-center justify-end gap-1 sm:max-w-none [&_button]:min-h-11 [&_button]:min-w-11 sm:[&_button]:min-h-0 sm:[&_button]:min-w-0">
          {actions}
        </div>
      ) : null}
    </GroupedRow>
  );
}
