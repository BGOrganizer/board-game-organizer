import type { BggSearchItem } from "@board-game-organizer/schemas";
import {
  gameMetadataMissing,
  mergeBggGameMetadata,
  useWidgetBggGameMetadata,
} from "@board-game-organizer/shared";
import type { App } from "@modelcontextprotocol/ext-apps";
import { GameMetadataBadge } from "@/components/games/GameMetadataBadge";
import { callTool } from "./protocol";

export function McpGameMetadata({
  app,
  game,
  visible,
  size,
}: {
  app: App;
  game: BggSearchItem;
  visible: boolean;
  size?: "sm" | "md";
}) {
  const query = useWidgetBggGameMetadata(
    (ids, signal) => callTool(app, "get_bgg_games", { query: { ids: ids.join(",") } }, signal),
    game,
    visible,
  );
  return (
    <GameMetadataBadge
      game={mergeBggGameMetadata(game, query.data)}
      name={game.name}
      size={size}
      loading={query.isFetching || (!visible && gameMetadataMissing(game))}
      retry={query.isError ? () => void query.refetch() : undefined}
    />
  );
}
