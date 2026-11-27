import type { BggSearchItem } from "@board-game-organizer/schemas";
import type { App } from "@modelcontextprotocol/ext-apps";
import { GameListRowView } from "@/components/games/GameListRowView";
import { McpGameMetadata } from "./McpGameMetadata";
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
      renderMetadata={({ visible, size }) => (
        <McpGameMetadata app={app} game={game} visible={visible} size={size} />
      )}
    />
  );
}
