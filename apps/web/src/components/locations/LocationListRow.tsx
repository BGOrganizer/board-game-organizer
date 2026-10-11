"use client";

import { formatLocationAddress } from "@board-game-organizer/shared";
import { MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { GroupedRow } from "@/components/common/ui/GroupedRow";

export function LocationListRow({
  name,
  address,
  leading,
  actions,
}: {
  name: string;
  address: string;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <GroupedRow className="flex-wrap">
      {leading ?? <MapPin className="size-5 shrink-0 text-default-500" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={name}>
          {name}
        </p>
        <p className="truncate text-xs text-default-500" title={address}>
          {formatLocationAddress(address)}
        </p>
      </div>
      {actions}
    </GroupedRow>
  );
}
