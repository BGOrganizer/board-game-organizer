"use client";

import type { BggSearchItem } from "@board-game-organizer/schemas";
import {
  gameMetadataMissing,
  mergeBggGameMetadata,
  useBggGameMetadata,
} from "@board-game-organizer/shared";
import type { ReactNode } from "react";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GameMetadataBadge } from "./GameMetadataBadge";

export function GameCatalogMetadata({
  game,
  name,
  visible,
  render,
}: {
  game: BggSearchItem;
  name: string;
  visible: boolean;
  render?: (badge: ReactNode) => ReactNode;
}) {
  return render || (visible && gameMetadataMissing(game)) ? (
    <GameMetadataLookup game={game} name={name} visible={visible} render={render} />
  ) : (
    <GameMetadataBadge game={game} name={name} loading={gameMetadataMissing(game)} />
  );
}

function GameMetadataLookup({
  game,
  name,
  visible,
  render,
}: {
  game: BggSearchItem;
  name: string;
  visible: boolean;
  render?: (badge: ReactNode) => ReactNode;
}) {
  const query = useBggGameMetadata(useCommunityApi(), game, visible);
  const badge = (
    <GameMetadataBadge
      game={mergeBggGameMetadata(game, query.data)}
      name={name}
      loading={query.isFetching || (!visible && gameMetadataMissing(game))}
      retry={query.isError ? () => void query.refetch() : undefined}
      size={render ? "md" : "sm"}
    />
  );
  return render ? render(badge) : badge;
}
