"use client";

import { Button } from "@heroui/react";
import { UserRoundPlus } from "lucide-react";
import type { ReactNode } from "react";
import { GroupedRow } from "./GroupedRow";

export function AddUserRow({
  label,
  description,
  onPress,
  isDisabled,
  actions,
  className,
}: {
  label: string;
  description?: string;
  onPress: () => void;
  isDisabled?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <GroupedRow className={className}>
      <Button
        data-form-control
        variant="ghost"
        className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2 whitespace-normal px-0 text-left"
        aria-label={label}
        isDisabled={isDisabled}
        onPress={onPress}
      >
        <span className="inline-flex min-h-16 w-13 shrink-0 items-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-default text-muted">
            <UserRoundPlus className="size-5" aria-hidden />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-muted">{label}</span>
          {description ? <span className="block text-sm text-muted">{description}</span> : null}
        </span>
      </Button>
      {actions}
    </GroupedRow>
  );
}
