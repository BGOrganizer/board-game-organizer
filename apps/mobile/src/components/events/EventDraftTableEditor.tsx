import { type EventTableDraft, publicTableTimeBounds } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { Minus, Plus, Trash2, X } from "lucide-react-native";
import { View } from "react-native";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { GameListRow } from "@/components/games/GameListRow";
import { useT } from "@/lib/i18n";
import { EventDateTimeField } from "./EventDateTimeField";

export function EventDraftTableEditor({
  row,
  publicGroup,
  timeZone,
  eventStartWall = "",
  eventEndWall = "",
  busy,
  fieldError = () => false,
  onChange,
  onRemove,
  onGame,
  onDemonstrator,
}: {
  row: EventTableDraft;
  publicGroup: boolean;
  timeZone: string;
  eventStartWall?: string;
  eventEndWall?: string;
  busy: boolean;
  fieldError?: (path: string) => boolean;
  onChange: (value: Partial<EventTableDraft>) => void;
  onRemove: () => void;
  onGame: () => void;
  onDemonstrator: () => void;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const day = eventStartWall.slice(0, 10);
  const bounds = publicTableTimeBounds(
    eventStartWall,
    eventEndWall,
    Math.max(1, ...row.games.map((game) => game.maxPlayMinutes ?? game.manualDurationMinutes ?? 1)),
  );
  const [dangerForeground, danger] = useThemeColor(["danger-foreground", "danger"]);
  const helpTitle = t("Field help");
  return (
    <View className="rounded-xl bg-surface" style={{ padding: 16, gap: 16 }}>
      <View style={{ gap: 6 }}>
        <SearchHelpLabel
          label={t("Table name")}
          helpTitle={helpTitle}
          help={t("Name this table so players can recognize it. Use between 1 and 120 characters.")}
        />
        <Input
          accessibilityLabel={t("Table name")}
          placeholder={t("Strategy table")}
          maxLength={120}
          value={row.name}
          onChangeText={(name) => onChange({ name })}
          editable={!busy}
          isInvalid={fieldError("name")}
        />
        {fieldError("name") ? (
          <Typography accessibilityRole="alert" className="text-sm text-danger">
            {t("Enter a table name between 1 and 120 characters.")}
          </Typography>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <PlayerCount
          label={t("Minimum players")}
          help={t("At least two players are required. The minimum cannot exceed the maximum.")}
          value={row.minPlayers}
          min={2}
          max={row.maxPlayers}
          busy={busy}
          onChange={(minPlayers) => onChange({ minPlayers })}
        />
        <PlayerCount
          label={t("Maximum players")}
          help={t("Set the table capacity at or above the minimum number of players.")}
          value={row.maxPlayers}
          min={row.minPlayers}
          max={Number.MAX_SAFE_INTEGER}
          busy={busy}
          onChange={(maxPlayers) => onChange({ maxPlayers })}
        />
      </View>
      {fieldError("minPlayers") || fieldError("maxPlayers") ? (
        <Typography accessibilityRole="alert" className="text-sm text-danger">
          {t("The minimum must be at least two and cannot exceed the maximum.")}
        </Typography>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <SearchHelpLabel
            label={t("Enable ratings")}
            helpTitle={helpTitle}
            help={t(
              "Rated tables update player ratings after final results. At least two players must have a score.",
            )}
          />
        </View>
        <Switch
          accessibilityLabel={t("Enable ratings")}
          isSelected={row.rankingEnabled}
          onSelectedChange={(rankingEnabled) => onChange({ rankingEnabled })}
          isDisabled={busy}
        />
      </View>
      {publicGroup ? (
        <>
          {day ? (
            <Typography className="text-sm text-muted">
              {new Intl.DateTimeFormat(i18n.locale, {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(new Date(`${day}T00:00Z`))}
            </Typography>
          ) : null}
          <EventDateTimeField
            mode="time"
            day={day}
            min={bounds.min}
            max={bounds.max}
            label={t("Table start")}
            help={t(
              "The date is fixed to the event day. Choose a time at or after the event starts; the whole table must finish by the event end.",
            )}
            timeZone={timeZone}
            value={row.startsWall.slice(11, 16)}
            isDisabled={busy || !bounds.min || !bounds.max}
            error={
              fieldError("startsAt")
                ? t("Choose a table start and duration within the event.")
                : undefined
            }
            onChange={(startsWall) => onChange({ startsWall })}
          />
          <View style={{ gap: 8 }}>
            <SearchHelpLabel
              label={t("Demonstrator")}
              helpTitle={helpTitle}
              help={t(
                "Optionally assign an accepted group member to demonstrate this public table. Their other tables must not overlap.",
              )}
            />
            {row.demonstratorUserId ? (
              <GroupedList>
                <UserListRow
                  name={row.demonstratorName ?? t("Unknown")}
                  avatarUrl={row.demonstratorAvatarUrl}
                  onPress={onDemonstrator}
                  accessibilityLabel={t("Choose demonstrator")}
                  isDisabled={busy}
                  actions={
                    <Button
                      isIconOnly
                      size="sm"
                      variant="danger-soft"
                      accessibilityLabel={t("Remove demonstrator")}
                      isDisabled={busy}
                      onPress={() =>
                        onChange({
                          demonstratorUserId: undefined,
                          demonstratorName: undefined,
                          demonstratorAvatarUrl: undefined,
                        })
                      }
                    >
                      <X size={18} color={danger} />
                    </Button>
                  }
                />
              </GroupedList>
            ) : (
              <AddUserRow
                label={t("Choose demonstrator")}
                onPress={onDemonstrator}
                isDisabled={busy}
              />
            )}
          </View>
        </>
      ) : null}
      <View style={{ gap: 8 }}>
        <SearchHelpLabel
          label={t("Games")}
          helpTitle={helpTitle}
          help={t(
            "Choose at least one game. Use the empty game slot to add another option. Players vote on these games.",
          )}
        />
        <GroupedList>
          {row.games.map((game, index) => (
            <GameListRow
              key={game.id}
              name={game.name}
              imageUrl={game.imageUrl}
              year={game.year}
              average={game.average}
              rank={game.rank}
              actions={
                <Button
                  isIconOnly
                  size="sm"
                  style={{ minWidth: 44, minHeight: 44 }}
                  variant="danger-soft"
                  accessibilityLabel={`${t("Remove game")}: ${game.name}`}
                  isDisabled={busy}
                  onPress={() =>
                    onChange({ games: row.games.filter((candidate) => candidate.id !== game.id) })
                  }
                >
                  <X size={18} color={danger} />
                </Button>
              }
            >
              {publicGroup ? (
                game.maxPlayMinutes ? (
                  <Typography className="text-sm text-muted">
                    {t("Duration")}: {game.maxPlayMinutes} {t("minutes")} · BoardGameGeek
                  </Typography>
                ) : (
                  <View style={{ gap: 6 }}>
                    <SearchHelpLabel
                      label={t("Manual duration in minutes")}
                      helpTitle={helpTitle}
                      help={t(
                        "BoardGameGeek has no duration for this game. Enter a positive whole number of minutes.",
                      )}
                    />
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
                          games: row.games.map((candidate) =>
                            candidate.id === game.id
                              ? {
                                  ...candidate,
                                  manualDurationMinutes: value ? Number(value) : undefined,
                                }
                              : candidate,
                          ),
                        })
                      }
                      editable={!busy}
                      isInvalid={fieldError(`games.${index}.manualDurationMinutes`)}
                    />
                    {fieldError(`games.${index}.manualDurationMinutes`) ? (
                      <Typography accessibilityRole="alert" className="text-sm text-danger">
                        {t("Enter a valid game duration in minutes.")}
                      </Typography>
                    ) : null}
                  </View>
                )
              ) : null}
            </GameListRow>
          ))}
          <GameListRow
            name={t("Choose a game")}
            onPress={busy || row.games.length >= 20 ? undefined : onGame}
          />
        </GroupedList>
        {fieldError("games") && !row.games.length ? (
          <Typography accessibilityRole="alert" className="text-sm text-danger">
            {t("Choose at least one game.")}
          </Typography>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Button
          isIconOnly
          variant="danger"
          accessibilityLabel={t("Remove table")}
          isDisabled={busy}
          onPress={onRemove}
        >
          <Trash2 size={20} color={dangerForeground} />
        </Button>
      </View>
    </View>
  );
}
function PlayerCount({
  label,
  help,
  value,
  min,
  max,
  busy,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  busy: boolean;
  onChange: (value: number) => void;
}) {
  const t = useT(),
    foreground = useThemeColor("accent-foreground");
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
      <SearchHelpLabel label={label} help={help} helpTitle={t("Field help")} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Button
          isIconOnly
          size="sm"
          style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
          hitSlop={4}
          variant="primary"
          accessibilityLabel={`${t("Decrease")}: ${label}`}
          isDisabled={busy || value <= min}
          onPress={() => onChange(value - 1)}
        >
          <Minus size={14} color={foreground} />
        </Button>
        <Typography
          className="font-bold text-foreground"
          accessibilityLabel={`${label}: ${value}`}
          accessibilityLiveRegion="polite"
          style={{ minWidth: 18, textAlign: "center" }}
        >
          {value}
        </Typography>
        <Button
          isIconOnly
          size="sm"
          style={{ width: 36, height: 36, minWidth: 36, minHeight: 36 }}
          hitSlop={4}
          variant="primary"
          accessibilityLabel={`${t("Increase")}: ${label}`}
          isDisabled={busy || value >= max}
          onPress={() => onChange(value + 1)}
        >
          <Plus size={14} color={foreground} />
        </Button>
      </View>
    </View>
  );
}
