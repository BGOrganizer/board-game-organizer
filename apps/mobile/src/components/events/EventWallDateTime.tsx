import { View } from "react-native";
import { EventDateTimeField } from "./EventDateTimeField";
export function EventWallDateTime({
  label,
  value,
  timeZone,
  help,
  error,
  isDisabled,
  onChange,
}: {
  label: string;
  value: string;
  timeZone: string;
  help?: string;
  error?: string;
  isDisabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <EventDateTimeField
        label={label}
        help={help}
        error={error}
        isDisabled={isDisabled}
        mode="date"
        timeZone={timeZone}
        value={value}
        onChange={(next) => onChange(`${next.slice(0, 10)}T${value.slice(11, 16) || "20:00"}`)}
      />
      <EventDateTimeField
        label={`${label} · HH:mm`}
        help={help}
        isDisabled={isDisabled}
        mode="time"
        day={value.slice(0, 10)}
        timeZone={timeZone}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}
