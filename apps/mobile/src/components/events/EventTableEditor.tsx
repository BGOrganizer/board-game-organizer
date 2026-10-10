import type { EventTableInput } from "@board-game-organizer/schemas";
import {
  type EventDraftTable,
  type EventFormErrors,
  eventDateLimit,
  eventLocalDateTime,
  eventPlayerRange,
  eventTableForm,
} from "@board-game-organizer/shared";
import { Stack } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Input } from "heroui-native/input";
import { Switch } from "heroui-native/switch";
import { Typography } from "heroui-native/text";
import { ArrowLeft, ClipboardList, Minus, Plus, Save, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { GameListRow } from "@/components/games/GameListRow";
import GamePicker from "@/components/games/GamePicker";
import { useT } from "@/lib/i18n";
import { EventDateTimeField } from "./EventDateTimeField";
import { EventDemonstratorPicker } from "./EventDemonstratorPicker";

export function EventTableEditor({
  draft,
  timeZone,
  eventStart,
  eventEnd,
  organizationId,
  onSave,
  onClose,
}: {
  draft: EventDraftTable;
  timeZone: string;
  eventStart: string;
  eventEnd: string;
  organizationId: string;
  onSave: (table: EventDraftTable) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [foreground, danger, accentForeground] = useThemeColor([
    "foreground",
    "danger",
    "accent-foreground",
  ]);
  const [value, setValue] = useState(draft);
  const [start, setStart] = useState(
    eventLocalDateTime(draft.input.startsAt, timeZone).slice(0, 16),
  );
  const [end, setEnd] = useState(eventLocalDateTime(draft.input.endsAt, timeZone).slice(0, 16));
  const [pickGame, setPickGame] = useState(false);
  const [pickDemo, setPickDemo] = useState(false);
  const [errors, setErrors] = useState<EventFormErrors>({});
  const patch = (next: Partial<EventTableInput>) =>
    setValue((row) => ({ ...row, input: { ...row.input, ...next } }));
  const error = (field: string) =>
    errors[field] ? (
      <Typography className="text-sm text-danger" accessibilityRole="alert">
        {t(errors[field])}
      </Typography>
    ) : null;
  const min = eventDateLimit(
    eventLocalDateTime(eventStart, timeZone).slice(0, 16),
    timeZone,
    "after",
    eventStart,
  );
  const max = eventDateLimit(
    eventLocalDateTime(eventEnd, timeZone).slice(0, 16),
    timeZone,
    "before",
    eventEnd,
  );
  const tableEndMin = eventDateLimit(start, timeZone, "after", value.input.startsAt);
  const endMin = min && tableEndMin ? (min > tableEndMin ? min : tableEndMin) : min;
  const lastStart = max ? eventDateLimit(max, timeZone, "before") : undefined;
  const beforeEnd = eventDateLimit(end, timeZone, "before", value.input.endsAt);
  const startMax =
    beforeEnd && lastStart ? (beforeEnd < lastStart ? beforeEnd : lastStart) : lastStart;
  const day = eventLocalDateTime(eventStart, timeZone).slice(0, 10);
  if (pickGame)
    return (
      <GamePicker
        onClose={() => setPickGame(false)}
        onSelect={(game) => {
          setValue((row) => ({
            ...row,
            gameName: game.name,
            imageUrl: game.imageUrl,
            input: { ...row.input, gameId: game.id },
          }));
          setPickGame(false);
        }}
      />
    );
  if (pickDemo)
    return (
      <EventDemonstratorPicker
        organizationId={organizationId}
        onClose={() => setPickDemo(false)}
        onSelect={(member) => {
          setValue((row) => ({
            ...row,
            demonstrator: member,
            input: { ...row.input, demonstratorUserId: member.userId },
          }));
          setPickDemo(false);
        }}
      />
    );
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t("Configure table"),
          headerBackVisible: false,
          headerLeft: () => (
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("Back")}
              testID="event-table-header-back"
              onPress={onClose}
            >
              <ArrowLeft size={24} color={foreground} />
            </Button>
          ),
        }}
      />
      <ScreenScrollView
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ClipboardList size={20} color={foreground} />
            <SearchHelpLabel
              label={t("Table name")}
              helpTitle={t("Field help")}
              help={t("Give this table a recognizable name (1–120 characters).")}
            />
          </View>
          <Input
            accessibilityLabel={t("Table name")}
            value={value.input.name}
            onChangeText={(name) => patch({ name })}
            maxLength={120}
          />
          {error("name")}
        </View>
        <EventDateTimeField
          label={t("Start time")}
          mode="time"
          day={day}
          testID="event-table-startsAt-calendar"
          value={start}
          timeZone={timeZone}
          min={min}
          max={startMax}
          error={errors.startsAt ? t(errors.startsAt) : undefined}
          onChange={setStart}
        />
        <EventDateTimeField
          label={t("End time")}
          mode="time"
          day={day}
          testID="event-table-endsAt-calendar"
          value={end}
          timeZone={timeZone}
          min={endMin}
          max={max}
          error={errors.endsAt ? t(errors.endsAt) : undefined}
          onChange={setEnd}
        />
        <View style={{ flexDirection: "row", gap: 24, flexWrap: "wrap" }}>
          {(["minPlayers", "maxPlayers"] as const).map((field) => (
            <View key={field} style={{ gap: 6 }}>
              <Typography className="text-foreground">
                {field === "minPlayers" ? t("Minimum players") : t("Maximum players")}
              </Typography>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Button
                  size="sm"
                  isIconOnly
                  variant="secondary"
                  style={{ minHeight: 44, minWidth: 44 }}
                  accessibilityLabel={
                    field === "minPlayers" ? t("Decrease min players") : t("Decrease max players")
                  }
                  isDisabled={
                    field === "minPlayers"
                      ? value.input.minPlayers <= 2
                      : value.input.maxPlayers <= value.input.minPlayers
                  }
                  onPress={() =>
                    patch(
                      eventPlayerRange(value.input.minPlayers, value.input.maxPlayers, field, -1),
                    )
                  }
                >
                  <Minus size={18} color={foreground} />
                </Button>
                <Typography
                  className="font-bold text-foreground"
                  accessibilityLabel={
                    field === "minPlayers" ? t("Minimum players") : t("Maximum players")
                  }
                >
                  {value.input[field]}
                </Typography>
                <Button
                  size="sm"
                  isIconOnly
                  variant="secondary"
                  style={{ minHeight: 44, minWidth: 44 }}
                  accessibilityLabel={
                    field === "minPlayers" ? t("Increase min players") : t("Increase max players")
                  }
                  onPress={() =>
                    patch(
                      eventPlayerRange(value.input.minPlayers, value.input.maxPlayers, field, 1),
                    )
                  }
                >
                  <Plus size={18} color={foreground} />
                </Button>
              </View>
              {error(field)}
            </View>
          ))}
        </View>
        <Typography className="font-medium text-foreground">{t("Board game")}</Typography>
        <GroupedList>
          <GameListRow
            name={value.gameName || t("Select a board game")}
            imageUrl={value.imageUrl}
            onPress={() => setPickGame(true)}
            actions={
              value.input.gameId > 0 ? (
                <Button
                  isIconOnly
                  size="sm"
                  style={{ minHeight: 44, minWidth: 44 }}
                  variant="danger-soft"
                  accessibilityLabel={t("Remove game")}
                  onPress={() =>
                    setValue((row) => ({
                      ...row,
                      gameName: "",
                      imageUrl: undefined,
                      input: { ...row.input, gameId: 0 },
                    }))
                  }
                >
                  <Trash2 size={18} color={danger} />
                </Button>
              ) : undefined
            }
          />
        </GroupedList>
        {error("gameId")}
        <SearchHelpLabel
          label={t("Demonstrator")}
          helpTitle={t("Field help")}
          help={t(
            "Optional: choose a confirmed organization member. They can record this table's results but do not automatically reserve a player seat.",
          )}
        />
        {value.input.demonstratorUserId ? (
          <GroupedList>
            <UserListRow
              name={
                value.demonstrator?.name ??
                value.demonstrator?.username ??
                t("Selected demonstrator")
              }
              avatarUrl={value.demonstrator?.avatarUrl}
              secondary={value.demonstrator?.username}
              accessibilityLabel={t("Choose demonstrator")}
              onPress={() => setPickDemo(true)}
              actions={
                <Button
                  size="sm"
                  isIconOnly
                  style={{ minHeight: 44, minWidth: 44 }}
                  variant="danger-soft"
                  accessibilityLabel={t("Remove demonstrator")}
                  onPress={() =>
                    setValue((row) => ({
                      ...row,
                      demonstrator: undefined,
                      input: { ...row.input, demonstratorUserId: undefined },
                    }))
                  }
                >
                  <Trash2 size={18} color={danger} />
                </Button>
              }
            />
          </GroupedList>
        ) : (
          <AddUserRow label={t("Choose demonstrator")} onPress={() => setPickDemo(true)} />
        )}
        {error("demonstratorUserId")}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Typography>{t("Global ratings enabled")}</Typography>
          <Switch
            accessibilityLabel={t("Global ratings enabled")}
            isSelected={value.input.openSkill}
            onSelectedChange={(openSkill) => patch({ openSkill })}
          />
        </View>
        <Button
          style={{ alignSelf: "flex-end" }}
          onPress={() => {
            const result = eventTableForm({
              input: value.input,
              start,
              end,
              zone: timeZone,
              eventStart,
              eventEnd,
            });
            setErrors(result.errors);
            if (result.data) onSave({ ...value, input: result.data });
          }}
        >
          <Save size={18} color={accentForeground} />
          <Button.Label>{t("Save table")}</Button.Label>
        </Button>
      </ScreenScrollView>
    </View>
  );
}
