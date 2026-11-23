"use client";

import type { BggSearchItem } from "@board-game-organizer/schemas";
import { gameMetadataMissing } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { Gamepad2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  ExpandableGroupedRow,
  type GroupedRowDisclosure,
} from "@/components/common/ui/ExpandableGroupedRow";
import { GroupedRow } from "@/components/common/ui/GroupedRow";

type MetadataProps = {
  game: BggSearchItem;
  name: string;
  visible: boolean;
  render?: (badge: ReactNode) => ReactNode;
};

export type GameListRowProps = {
  game?: BggSearchItem;
  name: string;
  imageUrl?: string | null;
  titleAccessory?: ReactNode;
  actions?: ReactNode;
  metadata?: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
  disclosure?: GroupedRowDisclosure;
};

export function GameListRowView({
  name,
  imageUrl,
  game,
  titleAccessory,
  actions,
  metadata,
  children,
  onPress,
  disclosure,
  renderMetadata,
}: GameListRowProps & { renderMetadata: (props: MetadataProps) => ReactNode }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const cover = useRef<HTMLDivElement>(null);
  const [visibleId, setVisibleId] = useState<number>();
  const id = game?.id;
  const expandable = disclosure !== undefined;
  const needsMetadata = Boolean(game && gameMetadataMissing(game) && visibleId !== id);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Switching row layouts replaces the observed cover.
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
  }, [id, needsMetadata, expandable]);

  const image = (
    <div
      ref={cover}
      className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-default"
    >
      {imageUrl && imageUrl !== failedImage ? (
        // biome-ignore lint/performance/noImgElement: BGG cover URLs are discovered at runtime.
        <img
          src={imageUrl}
          alt=""
          width={48}
          height={48}
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
      {metadata ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{metadata}</div>
      ) : null}
      {children}
    </div>
  );
  if (disclosure) {
    const renderRow = (badge?: ReactNode) => (
      <ExpandableGroupedRow
        disclosure={{
          ...disclosure,
          content: badge ? (
            <div className="flex items-center gap-2">
              {badge}
              <div className="min-w-0 flex-1">{disclosure.content}</div>
            </div>
          ) : (
            disclosure.content
          ),
        }}
        summary={
          <>
            {image}
            {identity}
          </>
        }
        actions={actions}
      />
    );
    return game
      ? renderMetadata({ name, game, visible: id === visibleId, render: renderRow })
      : renderRow();
  }
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
          <div className="absolute top-1/2 left-[26px] z-10 mt-0.5">
            {renderMetadata({ name, game, visible: id === visibleId })}
          </div>
        ) : null}
      </div>
      {actions}
    </GroupedRow>
  );
}
