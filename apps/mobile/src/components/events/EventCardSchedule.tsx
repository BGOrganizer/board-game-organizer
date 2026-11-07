import type { EventSchedulePreview } from "@board-game-organizer/schemas";
import { formatLocationAddress } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { MapPin } from "lucide-react-native";
import { View } from "react-native";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { useT } from "@/lib/i18n";

export function EventCardSchedule({ schedule }: { schedule?: EventSchedulePreview }) {
  const t = useT(),
    { i18n } = useLingui(),
    muted = useThemeColor("muted");
  const number = new Intl.NumberFormat(i18n.locale);
  if (!schedule)
    return (
      <View accessible accessibilityLabel={t("Loading…")} style={{ gap: 8 }}>
        <Skeleton style={{ width: "100%", maxWidth: 176, height: 16, borderRadius: 4 }} />
        <Skeleton style={{ width: "100%", maxWidth: 208, height: 16, borderRadius: 4 }} />
      </View>
    );
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        {schedule.localStartsAt ? (
          <DateTimeInfo startsAt={`${schedule.localStartsAt}Z`} timeZone="UTC" dateStyle="long" />
        ) : (
          <Typography className="text-sm text-foreground">{t("Dates to agree")}</Typography>
        )}
        {schedule.dateCount > 1 ? (
          <Typography
            className="text-sm text-accent-soft-foreground"
            accessibilityLabel={i18n._({
              id: "event.proposedDatesCount",
              message: "{count} proposed dates",
              values: { count: number.format(schedule.dateCount) },
            })}
          >
            +{number.format(schedule.dateCount)}
          </Typography>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
        <MapPin size={16} color={muted} accessible={false} />
        <Typography className="text-sm text-foreground" style={{ flex: 1, flexShrink: 1 }}>
          {schedule.location
            ? `${schedule.location.name} · ${formatLocationAddress(schedule.location.address)}`
            : t("Locations to agree")}
        </Typography>
        {schedule.locationCount > 1 ? (
          <Typography
            className="text-sm text-accent-soft-foreground"
            accessibilityLabel={i18n._({
              id: "event.proposedLocationsCount",
              message: "{count} proposed locations",
              values: { count: number.format(schedule.locationCount) },
            })}
          >
            +{number.format(schedule.locationCount)}
          </Typography>
        ) : null}
      </View>
    </View>
  );
}
