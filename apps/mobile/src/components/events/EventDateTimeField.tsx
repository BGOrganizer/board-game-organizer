import { eventLocalDateTime, eventTimeChoices } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarClock } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Platform, View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { useT } from "@/lib/i18n";

export function EventDateTimeField({
  label,
  value,
  timeZone,
  testID,
  min,
  max,
  error,
  onChange,
}: {
  label: string;
  value: string;
  timeZone: string;
  testID?: string;
  min?: string;
  max?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const muted = useThemeColor("muted");
  const [draft, setDraft] = useState<Date | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const slots = useMemo(
    () =>
      day ? eventTimeChoices(day, min, max).filter((wall) => wall.slice(11).includes(query)) : [],
    [day, min, max, query],
  );
  // Logical wall-clock fields in UTC; eventLocalToIso owns zone/DST validation.
  const wall = value || eventLocalDateTime(new Date().toISOString(), timeZone).slice(0, 16);
  const bounded = min && wall < min ? min : max && wall > max ? max : wall;
  const initial = new Date(`${bounded}Z`);
  const minimumDate = min ? new Date(`${min}Z`) : undefined;
  const maximumDate = max ? new Date(`${max}Z`) : undefined;
  const commit = (date: Date) => {
    const next = date.toISOString().slice(0, 16);
    if ((!min || next >= min) && (!max || next <= max)) onChange(next);
  };
  const pick = () => {
    if (Platform.OS !== "android") {
      setDraft(initial);
      return;
    }
    DateTimePickerAndroid.open({
      value: initial,
      mode: "date",
      timeZoneName: "UTC",
      minimumDate,
      maximumDate,
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
        // Android ignores bounds in mode="time". Offer only permitted minutes instead.
        if (min || max) {
          setQuery("");
          setDay(date.toISOString().slice(0, 10));
          return;
        }
        DateTimePickerAndroid.open({
          value: date,
          mode: "time",
          timeZoneName: "UTC",
          is24Hour: true,
          onChange: (timeEvent, selected) => {
            if (timeEvent.type === "set" && selected) commit(selected);
          },
        });
      },
    });
  };
  return (
    <View style={{ gap: 6 }}>
      <Typography className="font-medium text-foreground">{label}</Typography>
      <GroupedList>
        <GroupedRow>
          <CalendarClock size={20} color={muted} />
          <Button
            variant="ghost"
            accessibilityLabel={label}
            testID={testID}
            isDisabled={Boolean(min && max && min > max)}
            onPress={pick}
            style={{ flex: 1, minHeight: 44, justifyContent: "flex-start" }}
          >
            <Button.Label>
              {value
                ? new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${value}Z`))
                : t("Pick date and time")}
            </Button.Label>
          </Button>
        </GroupedRow>
      </GroupedList>
      {error ? (
        <Typography accessibilityRole="alert" className="text-sm text-danger">
          {error}
        </Typography>
      ) : null}
      {day ? (
        <Dialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setDay(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content>
              <Dialog.Title>{label}</Dialog.Title>
              <SearchInput
                value={query}
                onChange={setQuery}
                label={t("Search time")}
                placeholder={t("e.g. 18:30")}
              />
              <FlatList
                style={{ maxHeight: 320 }}
                data={slots}
                keyExtractor={(slot) => slot}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Button
                    variant="ghost"
                    accessibilityLabel={item.slice(11)}
                    testID={`event-time-${item.slice(11).replace(":", "-")}`}
                    onPress={() => {
                      commit(new Date(`${item}Z`));
                      setDay(null);
                    }}
                  >
                    {item.slice(11)}
                  </Button>
                )}
                ListEmptyComponent={
                  <Typography className="text-muted">
                    {t("No available times in this range")}
                  </Typography>
                }
              />
              <Button variant="ghost" onPress={() => setDay(null)}>
                {t("Cancel")}
              </Button>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ) : null}
      {draft ? (
        <Dialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setDraft(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content>
              <Dialog.Title>{label}</Dialog.Title>
              <DateTimePicker
                value={draft}
                mode="datetime"
                display="spinner"
                timeZoneName="UTC"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                onChange={(_, selected) => {
                  if (selected) setDraft(selected);
                }}
              />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
                <Button variant="ghost" onPress={() => setDraft(null)}>
                  {t("Cancel")}
                </Button>
                <Button
                  onPress={() => {
                    commit(draft);
                    setDraft(null);
                  }}
                >
                  {t("Done")}
                </Button>
              </View>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      ) : null}
    </View>
  );
}
