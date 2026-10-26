import { allowedEventTimes } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { Dialog } from "heroui-native/dialog";
import { Typography } from "heroui-native/text";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { useT } from "@/lib/i18n";

/** Android's system clock cannot disable times. Both columns offer only valid choices. */
export function EventBoundedTimePicker({
  label,
  value,
  min,
  max,
  onChange,
  onCancel,
}: {
  label: string;
  value: Date;
  min?: string;
  max?: string;
  onChange: (date: Date) => void;
  onCancel: () => void;
}) {
  const t = useT(),
    { i18n } = useLingui(),
    wall = value.toISOString().slice(0, 16);
  const [selected, setSelected] = useState(wall);
  const choices = allowedEventTimes(wall.slice(0, 10), min, max);
  const current = choices.includes(selected) ? selected : (choices[0] ?? wall);
  const hours = [...new Set(choices.map((time) => time.slice(11, 13)))];
  const minutes = choices
    .filter((time) => time.slice(11, 13) === current.slice(11, 13))
    .map((time) => time.slice(14, 16));
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>{label}</Dialog.Title>
          <Typography className="text-muted">
            {new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium", timeZone: "UTC" }).format(
              value,
            )}
          </Typography>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TimeColumn
              label={t("Hour")}
              values={hours}
              selected={current.slice(11, 13)}
              onChange={(hour) => {
                const next = `${wall.slice(0, 10)}T${hour}:${current.slice(14, 16)}`;
                setSelected(
                  choices.includes(next)
                    ? next
                    : (choices.find((time) => time.slice(11, 13) === hour) ?? current),
                );
              }}
            />
            <TimeColumn
              key={current.slice(11, 13)}
              label={t("Minute")}
              values={minutes}
              selected={current.slice(14, 16)}
              onChange={(minute) => setSelected(`${current.slice(0, 14)}${minute}`)}
            />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="ghost" onPress={onCancel}>
              <Button.Label>{t("Cancel")}</Button.Label>
            </Button>
            <Button
              variant="primary"
              isDisabled={!choices.includes(current)}
              onPress={() => onChange(new Date(`${current}Z`))}
            >
              <Button.Label>{t("Done")}</Button.Label>
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
function TimeColumn({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Typography className="text-foreground">{label}</Typography>
      <FlatList
        style={{ height: 240 }}
        data={values}
        keyExtractor={(item) => item}
        initialScrollIndex={values.length ? Math.max(0, values.indexOf(selected)) : undefined}
        getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
        renderItem={({ item }) => (
          <Button
            variant={item === selected ? "secondary" : "ghost"}
            style={{ height: 48 }}
            accessibilityLabel={`${label}: ${item}`}
            onPress={() => onChange(item)}
          >
            <Button.Label>{item}</Button.Label>
          </Button>
        )}
      />
    </View>
  );
}
