"use client";

import { GameCatalogMetadata } from "./GameCatalogMetadata";
import { type GameListRowProps, GameListRowView } from "./GameListRowView";

export function GameListRow(props: GameListRowProps) {
  return (
    <GameListRowView
      {...props}
      renderMetadata={(metadata) => <GameCatalogMetadata {...metadata} />}
    />
  );
}
