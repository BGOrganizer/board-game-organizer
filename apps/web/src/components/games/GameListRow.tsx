"use client";

import type { BggSearchItem } from "@board-game-organizer/schemas";
import { gameMetadataMissing } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { Plural } from "@lingui/react/macro";
import { Clock, Gamepad2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { GameCatalogMetadata } from "./GameCatalogMetadata";

export function GameListRow({
  name,
  imageUrl,
  game,
  durationMinutes,
  titleAccessory,
  actions,
  metadata,
  children,
  onPress,
}: {
  game?: BggSearchItem;
  durationMinutes?: number;
  name: string;
  imageUrl?: string | null;
  titleAccessory?: ReactNode;
  actions?: ReactNode;
  metadata?: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const cover = useRef<HTMLDivElement>(null);
  const [visibleId, setVisibleId] = useState<number>();
  const id = game?.id;
  const needsMetadata = Boolean(game && gameMetadataMissing(game) && visibleId !== id);
  useEffect(() => {
    if (
      !needsMetadata ||
      id === undefined ||
      !cover.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setVisibleId(id);
    });
    observer.observe(cover.current);
    return () => observer.disconnect();
  }, [id, needsMetadata]);

  const image = (
    <div
      ref={cover}
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default"
    >
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
  );
  const identity = (
    <div className="min-w-0 flex-1 text-left">
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 max-w-[40ch] truncate text-sm font-medium" title={name}>
          {name}
        </p>
        {titleAccessory}
      </div>
      {durationMinutes !== undefined || metadata ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {durationMinutes !== undefined ? (
            <p className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock size={12} aria-hidden />
              <Plural
                id="game.duration.minutes"
                value={durationMinutes}
                one="# minute"
                other="# minutes"
              />
            </p>
          ) : null}
          {metadata}
        </div>
      ) : null}
      {children}
    </div>
  );
  return (
    <GroupedRow className="w-full flex-wrap">
      <div className="relative flex min-w-0 flex-1">
        {onPress ? (
          <Button
            data-form-control
            variant="ghost"
            aria-label={name}
            className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2 px-0"
            onPress={onPress}
          >
            {image}
            {identity}
          </Button>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {image}
            {identity}
          </div>
        )}
        {game ? (
          <div className="absolute top-[calc(50%-8px)] left-3 z-10">
            <GameCatalogMetadata name={name} game={game} visible={id === visibleId} />
          </div>
        ) : null}
      </div>
      {actions}
    </GroupedRow>
  );
}
