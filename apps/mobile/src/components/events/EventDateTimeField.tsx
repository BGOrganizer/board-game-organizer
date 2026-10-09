import { eventLocalDateTime } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarClock } from "lucide-react-native";
import { useState } from "react";
import { Platform, View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { useT } from "@/lib/i18n";

export function EventDateTimeField({
  label,
  value,
  timeZone,
  testID,
  onChange,
}: {
  label: string;
  value: string;
  timeZone: string;
  testID?: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const muted = useThemeColor("muted");
  const [draft, setDraft] = useState<Date | null>(null);
  // Pick logical wall-clock fields in UTC; eventLocalToIso owns the real zone/DST validation.
  const wall = value || eventLocalDateTime(new Date().toISOString(), timeZone).slice(0, 16);
  const initial = new Date(`${wall}Z`);
  const commit = (date: Date) => onChange(date.toISOString().slice(0, 16));
  const pick = () => {
    if (Platform.OS !== "android") {
      setDraft(initial);
      return;
    }
    DateTimePickerAndroid.open({
      value: initial,
      mode: "date",
      timeZoneName: "UTC",
      onChange: (event, date) => {
        if (event.type !== "set" || !date) return;
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
            onPress={pick}
            style={{ flex: 1, minHeight: 44, justifyContent: "flex-start" }}
          >
            <Button.Label>
              {value
                ? new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(initial)
                : t("Pick date and time")}
            </Button.Label>
          </Button>
        </GroupedRow>
      </GroupedList>
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
