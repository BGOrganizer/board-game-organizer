import type { EventTableDraft } from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { Plus, Trash2, X } from "lucide-react-native";
import { View } from "react-native";
import { GameListRow } from "@/components/games/GameListRow";
import { useT } from "@/lib/i18n";
import { EventWallDateTime } from "./EventWallDateTime";
export function EventDraftTableEditor({
  row,
  publicGroup,
  timeZone,
  busy,
  onChange,
  onRemove,
  onGame,
  onDemonstrator,
}: {
  row: EventTableDraft;
  publicGroup: boolean;
  timeZone: string;
  busy: boolean;
  onChange: (value: Partial<EventTableDraft>) => void;
  onRemove: () => void;
  onGame: () => void;
  onDemonstrator: () => void;
}) {
  const t = useT(),
    fg = useThemeColor("foreground");
  return (
    <View className="rounded-xl bg-surface" style={{ padding: 16, gap: 12 }}>
      <Typography className="text-foreground">{t("Table name")}</Typography>
      <Input
        accessibilityLabel={t("Table name")}
        value={row.name}
        onChangeText={(name) => onChange({ name })}
        editable={!busy}
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Typography className="text-foreground">{t("Minimum players")}</Typography>
          <Input
            accessibilityLabel={t("Minimum players")}
            value={String(row.minPlayers)}
            keyboardType="number-pad"
            onChangeText={(value) => onChange({ minPlayers: Number(value) })}
            editable={!busy}
          />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Typography className="text-foreground">{t("Maximum players")}</Typography>
          <Input
            accessibilityLabel={t("Maximum players")}
            value={String(row.maxPlayers)}
            keyboardType="number-pad"
            onChangeText={(value) => onChange({ maxPlayers: Number(value) })}
            editable={!busy}
          />
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Typography className="text-foreground" style={{ flex: 1 }}>
          {t("Enable ratings")}
        </Typography>
        <Switch
          accessibilityLabel={t("Enable ratings")}
          isSelected={row.rankingEnabled}
          onSelectedChange={(rankingEnabled) => onChange({ rankingEnabled })}
          isDisabled={busy}
        />
      </View>
      {publicGroup ? (
        <>
          <EventWallDateTime
            label={t("Table start")}
            timeZone={timeZone}
            value={row.startsWall}
            onChange={(startsWall) => onChange({ startsWall })}
          />
          <Button variant="outline" isDisabled={busy} onPress={onDemonstrator}>
            <Button.Label>{t("Choose demonstrator")}</Button.Label>
          </Button>
          {row.demonstratorUserId ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {row.demonstratorName ?? t("Unknown")}
              </Typography>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                accessibilityLabel={t("Remove demonstrator")}
                onPress={() =>
                  onChange({ demonstratorUserId: undefined, demonstratorName: undefined })
                }
              >
                <X size={18} color={fg} />
              </Button>
            </View>
          ) : null}
        </>
      ) : null}
      {row.games.map((game) => (
        <View key={game.id} className="rounded-xl bg-background" style={{ padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <GameListRow
                name={game.name}
                imageUrl={game.imageUrl}
                year={game.year}
                average={game.average}
                rank={game.rank}
              />
            </View>
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              accessibilityLabel={`${t("Remove game")}: ${game.name}`}
              isDisabled={busy}
              onPress={() => onChange({ games: row.games.filter((g) => g.id !== game.id) })}
            >
              <X size={18} color={fg} />
            </Button>
          </View>
          {publicGroup ? (
            game.maxPlayMinutes ? (
              <Typography className="text-foreground">
                {t("Duration")}: {game.maxPlayMinutes} {t("minutes")} · BoardGameGeek
              </Typography>
            ) : (
              <>
                <Typography className="text-foreground">
                  {t("Manual duration in minutes")}
                </Typography>
                <Input
                  accessibilityLabel={t("Manual duration in minutes")}
                  keyboardType="number-pad"
                  value={
                    game.manualDurationMinutes === undefined
                      ? ""
                      : String(game.manualDurationMinutes)
                  }
                  onChangeText={(value) =>
                    onChange({
                      games: row.games.map((g) =>
                        g.id === game.id
                          ? { ...g, manualDurationMinutes: value ? Number(value) : undefined }
                          : g,
                      ),
                    })
                  }
                  editable={!busy}
                />
              </>
            )
          ) : null}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Button variant="outline" isDisabled={busy || row.games.length >= 20} onPress={onGame}>
          <Plus size={18} color={fg} />
          <Button.Label>{t("Add game")}</Button.Label>
        </Button>
        <Button
          isIconOnly
          variant="danger-soft"
          accessibilityLabel={t("Remove table")}
          isDisabled={busy}
          onPress={onRemove}
        >
          <Trash2 size={18} color={fg} />
        </Button>
      </View>
    </View>
  );
}
