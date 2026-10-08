import DateTimePicker from "@react-native-community/datetimepicker";

import { Button } from "heroui-native/button";

import { Input } from "heroui-native/input";

import { Typography } from "heroui-native/text";

import { useEffect, useState } from "react";
import { View } from "react-native";

import { useT } from "@/lib/i18n";

export function EventDateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [mode, setMode] = useState<"date" | "time" | null>(null);
  const date = new Date(value || Date.now());
  const valid = Number.isFinite(date.getTime()) ? date : new Date();
  return (
    <View style={{ gap: 6 }}>
      <Typography>{label}</Typography>
      <Input
        accessibilityLabel={label}
        value={draft}
        onChangeText={(next) => {
          setDraft(next);
          onChange(next);
        }}
        placeholder={t("YYYY-MM-DDTHH:mm")}
        autoCapitalize="none"
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button size="sm" variant="secondary" onPress={() => setMode("date")}>
          {t("Choose date")}
        </Button>
        <Button size="sm" variant="secondary" onPress={() => setMode("time")}>
          {t("Choose time")}
        </Button>
      </View>
      {mode ? (
        <DateTimePicker
          value={valid}
          mode={mode}
          onChange={(event, next) => {
            setMode(null);
            if (event.type === "dismissed" || !next) return;
            const result = new Date(valid);
            if (mode === "date")
              result.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
            else result.setHours(next.getHours(), next.getMinutes(), 0, 0);
            const pad = (n: number) => String(n).padStart(2, "0");
            onChange(
              `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}T${pad(result.getHours())}:${pad(result.getMinutes())}`,
            );
          }}
        />
      ) : null}
    </View>
  );
}
