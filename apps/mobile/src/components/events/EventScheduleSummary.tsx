import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventRecordSchedulePreview, formatLocationAddress } from "@board-game-organizer/shared";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { useT } from "@/lib/i18n";

export function EventScheduleSummary({ event }: { event: PlannedEventResponse }) {
  const t = useT();
  const schedule = eventRecordSchedulePreview(event);
  const date = schedule.dates?.[0];
  const location = schedule.locations?.[0];
  return (
    <>
      <View>
        <Typography className="font-bold text-foreground">{t("Date and time:")}</Typography>
        {date ? (
          <DateTimeInfo startsAt={`${date.localStartsAt}Z`} timeZone="UTC" dateStyle="long" />
        ) : (
          <Typography className="text-foreground">{t("No date selected")}</Typography>
        )}
      </View>
      <View>
        <Typography className="font-bold text-foreground">{t("Location:")}</Typography>
        <Typography className="text-foreground">
          {location ? formatLocationAddress(location.address) : t("No location selected")}
        </Typography>
      </View>
    </>
  );
}
