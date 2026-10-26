"use client";

import { formatLocationAddress } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { GroupedRow } from "@/components/common/ui/GroupedRow";

export function LocationListRow({
  name,
  address,
  leading,
  actions,
  children,
  onPress,
  label,
}: {
  name: string;
  address?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
  label?: string;
}) {
  const identity = (
    <div className="min-w-0 flex-1 text-left">
      <p className="truncate text-sm font-medium" title={name}>
        {name}
      </p>
      {address ? (
        <p className="truncate text-xs text-default-500" title={address}>
          {formatLocationAddress(address)}
        </p>
      ) : null}
      {children}
    </div>
  );
  return (
    <GroupedRow className="flex-wrap">
      {leading ?? <MapPin className="size-5 shrink-0 text-default-500" aria-hidden />}
      {onPress ? (
        <Button
          variant="ghost"
          className="h-auto min-h-11 min-w-0 flex-1 justify-start px-0"
          aria-label={label ?? name}
          onPress={onPress}
        >
          {identity}
        </Button>
      ) : (
        identity
      )}
      {actions}
    </GroupedRow>
  );
}
