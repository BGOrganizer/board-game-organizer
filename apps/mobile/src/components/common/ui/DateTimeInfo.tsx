import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays, Clock3 } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function DateTimeInfo({
  startsAt,
  endsAt,
  timeZone,
}: {
  startsAt: string;
  endsAt?: string;
  timeZone?: string;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const muted = useThemeColor("muted");
  const date = new Intl.DateTimeFormat(i18n.locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone,
  });
  const time = new Intl.DateTimeFormat(i18n.locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <CalendarDays size={16} color={muted} />
      <Typography className="text-sm text-foreground">{date.format(new Date(startsAt))}</Typography>
      <Clock3 size={16} color={muted} />
      <Typography
        className="text-sm text-foreground"
        accessibilityLabel={`${t("Start time")}: ${time.format(new Date(startsAt))}`}
      >
        {time.format(new Date(startsAt))}
      </Typography>
      {endsAt ? (
        <Typography
          className="text-sm text-foreground"
          accessibilityLabel={`${t("End time")}: ${time.format(new Date(endsAt))}`}
        >
          – {time.format(new Date(endsAt))}
        </Typography>
      ) : null}
    </View>
  );
}
