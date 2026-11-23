import type { BggSearchItem } from "@board-game-organizer/schemas";
import {
  gameMetadataMissing,
  mergeBggGameMetadata,
  useWidgetBggGameMetadata,
} from "@board-game-organizer/shared";
import type { App } from "@modelcontextprotocol/ext-apps";
import { GameListRowView } from "@/components/games/GameListRowView";
import { GameMetadataBadge } from "@/components/games/GameMetadataBadge";
import { callTool } from "./protocol";
import { useWidgetNavigation } from "./WidgetNavigation";

export function McpGameListRow({
  app,
  game,
  navigable = true,
}: {
  game: BggSearchItem;
  app: App;
  navigable?: boolean;
}) {
  const { openTool } = useWidgetNavigation(app);
  return (
    <GameListRowView
      game={game}
      name={game.name}
      imageUrl={game.imageUrl}
      onPress={
        navigable && openTool
          ? () => void openTool("get_bgg_games", { query: { ids: String(game.id) } })
          : undefined
      }
      renderMetadata={({ visible }) => <McpGameMetadata app={app} game={game} visible={visible} />}
    />
  );
}

function McpGameMetadata({
  app,
  game,
  visible,
}: {
  app: App;
  game: BggSearchItem;
  visible: boolean;
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
      loading={query.isFetching || (!visible && gameMetadataMissing(game))}
      retry={query.isError ? () => void query.refetch() : undefined}
    />
  );
}
