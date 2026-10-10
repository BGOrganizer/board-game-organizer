import { eventLocalDateTime } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays, Clock3 } from "lucide-react-native";
import { useState } from "react";
import { Platform, View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { useT } from "@/lib/i18n";

export function EventDateTimeField({
  label,
  value,
  mode,
  day,
  timeZone,
  testID,
  min,
  max,
  error,
  help,
  onChange,
}: {
  label: string;
  value: string;
  mode: "date" | "time";
  day?: string;
  timeZone: string;
  testID?: string;
  min?: string;
  max?: string;
  error?: string;
  help?: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const muted = useThemeColor("muted");
  const [draft, setDraft] = useState<Date | null>(null);
  const [pickerError, setPickerError] = useState("");
  const wall =
    value || `${day || eventLocalDateTime(new Date().toISOString(), timeZone).slice(0, 10)}T00:00`;
  const bounded = min && wall < min ? min : max && wall > max ? max : wall;
  const initial = new Date(`${bounded}Z`);
  const commit = (date: Date) => {
    const next =
      mode === "time"
        ? `${day || wall.slice(0, 10)}T${date.toISOString().slice(11, 16)}`
        : date.toISOString().slice(0, 16);
    // Android's native time picker ignores min/max. Never clamp or accept an invalid choice.
    if ((min && next < min) || (max && next > max)) {
      setPickerError(t("Choose a time within the allowed range."));
      return;
    }
    setPickerError("");
    onChange(next);
  };
  const pick = () => {
    setPickerError("");
    if (Platform.OS !== "android") {
      setDraft(initial);
      return;
    }
    DateTimePickerAndroid.open({
      value: initial,
      mode,
      timeZoneName: "UTC",
      is24Hour: true,
      minimumDate: min ? new Date(`${min}Z`) : undefined,
      maximumDate: max ? new Date(`${max}Z`) : undefined,
      onChange: (event, date) => {
        if (event.type === "set" && date) commit(date);
      },
    });
  };
  const Icon = mode === "date" ? CalendarDays : Clock3;
  return (
    <View style={{ gap: 6 }}>
      {help ? (
        <SearchHelpLabel label={label} help={help} helpTitle={t("Field help")} />
      ) : (
        <Typography className="font-medium text-foreground">{label}</Typography>
      )}
      <GroupedList>
        <GroupedRow>
          <Icon size={20} color={muted} />
          <Button
            variant="ghost"
            accessibilityLabel={label}
            testID={testID}
            isDisabled={Boolean((mode === "time" && !day) || (min && max && min > max))}
            onPress={pick}
            style={{ flex: 1, minHeight: 44, justifyContent: "flex-start", paddingHorizontal: 0 }}
          >
            <Button.Label>
              {value
                ? new Intl.DateTimeFormat(i18n.locale, {
                    ...(mode === "date"
                      ? { dateStyle: "medium" as const }
                      : { timeStyle: "short" as const }),
                    timeZone: "UTC",
                  }).format(new Date(`${value}Z`))
                : mode === "date"
                  ? t("Pick event day")
                  : t("Pick time")}
            </Button.Label>
          </Button>
        </GroupedRow>
      </GroupedList>
      {error || pickerError ? (
        <Typography accessibilityRole="alert" className="text-sm text-danger">
          {error || pickerError}
        </Typography>
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
                mode={mode}
                display="spinner"
                timeZoneName="UTC"
                minimumDate={min ? new Date(`${min}Z`) : undefined}
                maximumDate={max ? new Date(`${max}Z`) : undefined}
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
