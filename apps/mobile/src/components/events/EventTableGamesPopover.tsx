import type { BggSearchItem } from "@board-game-organizer/schemas";
import { Typography } from "heroui-native/text";
import { Dices } from "lucide-react-native";
import { FlatList, useWindowDimensions } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { GameListRow } from "@/components/games/GameListRow";
import { useT } from "@/lib/i18n";

/** Informational only: canonical games supplied by the card, never a detail request. */
export function EventTableGamesPopover({
  games,
  name,
}: {
  games: readonly BggSearchItem[];
  name: string;
}) {
  const t = useT();
  const { width, height } = useWindowDimensions();
  return (
    <HelpPopover
      label={`${t("Board games")}: ${name}`}
      title={t("Board games")}
      icon={Dices}
      triggerClassName="bg-default"
      width={Math.min(360, width - 32)}
    >
      <FlatList
        data={games}
        keyExtractor={(game) => String(game.id)}
        style={{ maxHeight: Math.min(320, height * 0.5) }}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        renderItem={({ item }) => (
          <GameListRow
            name={item.name}
            imageUrl={item.imageUrl}
            year={item.year}
            average={item.average}
            rank={item.rank}
          />
        )}
        ListEmptyComponent={<Typography className="text-muted">{t("No games found")}</Typography>}
      />
    </HelpPopover>
  );
}
