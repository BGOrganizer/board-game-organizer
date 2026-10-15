import type { MatchLocation } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays, ClipboardList, Clock3, MapPin } from "lucide-react-native";
import { View } from "react-native";
import { useT } from "@/lib/i18n";

export function EventWizardSummary({
  startsAt,
  endsAt,
  timeZone,
  name,
  location,
}: {
  startsAt: string;
  endsAt: string;
  timeZone: string;
  name?: string;
  location?: MatchLocation;
}) {
  const t = useT();
  const { i18n } = useLingui();
  const muted = useThemeColor("muted");
  const date = new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium", timeZone });
  const time = new Intl.DateTimeFormat(i18n.locale, { timeStyle: "short", timeZone });
  return (
    <View style={{ gap: 12 }}>
      {name !== undefined ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ClipboardList size={20} color={muted} />
          <Typography className="text-muted">{t("Event name")}:</Typography>
          <Typography className="text-foreground" style={{ flex: 1 }}>
            {name}
          </Typography>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <CalendarDays size={20} color={muted} />
        <Typography className="text-muted">{t("Event day")}:</Typography>
        <Typography className="text-foreground" style={{ flex: 1 }}>
          {date.format(new Date(startsAt))}
        </Typography>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {[
          { label: t("Start time"), value: startsAt },
          { label: t("End time"), value: endsAt },
        ].map(({ label, value }) => (
          <View key={label} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Clock3 size={20} color={muted} />
            <View style={{ flex: 1 }}>
              <Typography className="text-sm text-muted">{label}</Typography>
              <Typography className="text-foreground">{time.format(new Date(value))}</Typography>
            </View>
          </View>
        ))}
      </View>
      {location ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <MapPin size={20} color={muted} />
          <View style={{ flex: 1 }}>
            <Typography className="text-muted">{t("Event location")}</Typography>
            <Typography className="text-foreground">{location.name}</Typography>
            <Typography className="text-foreground">{location.address}</Typography>
          </View>
        </View>
      ) : null}
    </View>
  );
}
