"use client";

import { Button } from "@heroui/react";
import { Gamepad2 } from "lucide-react";
import { type ComponentProps, type ReactNode, useState } from "react";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GameCatalogMetadata } from "./GameCatalogMetadata";

export function GameListRow({
  name,
  imageUrl,
  year,
  average,
  rank,
  durationMinutes,
  titleAccessory,
  actions,
  metadata,
  children,
  onPress,
}: ComponentProps<typeof GameCatalogMetadata> & {
  name: string;
  imageUrl?: string | null;
  titleAccessory?: ReactNode;
  actions?: ReactNode;
  metadata?: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const identity = (
    <>
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default">
        {imageUrl && imageUrl !== failedImage ? (
          // biome-ignore lint/performance/noImgElement: BGG cover URLs are discovered at runtime.
          <img
            src={imageUrl}
            alt=""
            width={40}
            height={40}
            onError={() => setFailedImage(imageUrl)}
            className="size-full object-contain"
          />
        ) : (
          <Gamepad2 className="size-5 text-muted" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 max-w-[40ch] truncate text-sm font-medium" title={name}>
            {name}
          </p>
          {titleAccessory}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <GameCatalogMetadata
            year={year}
            average={average}
            rank={rank}
            durationMinutes={durationMinutes}
          />
          {metadata}
        </div>
        {children}
      </div>
    </>
  );
  return (
    <GroupedRow className="flex-wrap">
      {onPress ? (
        <Button
          data-form-control
          variant="ghost"
          aria-label={name}
          className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2 px-0"
          onPress={onPress}
        >
          {identity}
        </Button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{identity}</div>
      )}
      {actions}
    </GroupedRow>
  );
}
