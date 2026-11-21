import type { BggSearchItem } from "@board-game-organizer/schemas";
import { Typography } from "heroui-native/text";
import { Dices } from "lucide-react-native";
import { useWindowDimensions } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { GameListRow } from "@/components/games/GameListRow";
import { useT } from "@/lib/i18n";

/** The card supplies canonical games without loading the Table detail. */
export function EventTableGamesPopover({
  games,
  name,
}: {
  games: readonly (BggSearchItem & { durationMinutes?: number })[];
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
      size="compact"
      tone="accent"
      width={Math.min(360, width - 32)}
    >
      <InputFlatList
        data={games}
        keyExtractor={(game) => String(game.id)}
        style={{ height: Math.min(320, height * 0.5, Math.max(60, games.length * 76)) }}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        renderItem={({ item }) => (
          <GameListRow game={item} name={item.name} imageUrl={item.imageUrl} />
        )}
        ListEmptyComponent={<Typography className="text-muted">{t("No games found")}</Typography>}
      />
    </HelpPopover>
  );
}
