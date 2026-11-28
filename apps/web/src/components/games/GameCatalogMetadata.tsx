"use client";

import type { BggSearchItem } from "@board-game-organizer/schemas";
import {
  gameMetadataMissing,
  mergeBggGameMetadata,
  useBggGameMetadata,
} from "@board-game-organizer/shared";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GameMetadataBadge } from "./GameMetadataBadge";

export function GameCatalogMetadata({
  game,
  name,
  visible,
  size,
}: {
  game: BggSearchItem;
  name: string;
  visible: boolean;
  size?: "sm" | "md";
}) {
  return visible && gameMetadataMissing(game) ? (
    <GameMetadataLookup game={game} name={name} size={size} />
  ) : (
    <GameMetadataBadge game={game} name={name} loading={gameMetadataMissing(game)} size={size} />
  );
}

function GameMetadataLookup({
  game,
  name,
  size,
}: {
  game: BggSearchItem;
  name: string;
  size?: "sm" | "md";
}) {
  const query = useBggGameMetadata(useCommunityApi(), game, true);
  return (
    <GameMetadataBadge
      game={mergeBggGameMetadata(game, query.data)}
      name={name}
      loading={query.isFetching}
      retry={query.isError ? () => void query.refetch() : undefined}
      size={size}
    />
  );
}
