"use client";

import { Gamepad2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GameCatalogMetadata } from "./GameCatalogMetadata";

export function GameListRow({
  name,
  imageUrl,
  year,
  average,
  rank,
  actions,
  children,
}: ComponentProps<typeof GameCatalogMetadata> & {
  name: string;
  imageUrl?: string | null;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <GroupedRow className="flex-wrap">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default-100">
        {imageUrl ? (
          // biome-ignore lint/performance/noImgElement: BGG cover URLs are discovered at runtime.
          <img src={imageUrl} alt="" className="size-full object-contain" />
        ) : (
          <Gamepad2 className="size-5 text-default-400" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="max-w-[40ch] truncate text-sm font-medium" title={name}>
          {name}
        </p>
        <GameCatalogMetadata year={year} average={average} rank={rank} />
        {children}
      </div>
      {actions}
    </GroupedRow>
  );
}
