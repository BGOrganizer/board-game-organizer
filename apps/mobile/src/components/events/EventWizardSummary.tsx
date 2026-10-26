import {
  type EventRecordDraft,
  eventDateWall,
  eventLocalToIso,
} from "@board-game-organizer/shared";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";

export function EventWizardSummary({
  draft,
  groupName,
  publicGroup = false,
}: {
  draft: EventRecordDraft;
  groupName?: string | null;
  publicGroup?: boolean;
}) {
  const t = useT();
  return (
    <View style={{ gap: 20 }}>
      <Typography className="font-bold text-foreground" accessibilityRole="header">
        {draft.name}
      </Typography>
      <View style={{ gap: 8 }}>
        <SearchHelpLabel
          label={t("Group")}
          helpTitle={t("Field help")}
          help={
            groupName
              ? t("This event belongs to this group. The group cannot be changed.")
              : t("Choose one of your groups, or create a standalone event without a group.")
          }
        />
        <Typography className="text-foreground">{groupName ?? t("No group")}</Typography>
      </View>
      <View style={{ gap: 8 }}>
        <SearchHelpLabel
          label={publicGroup ? t("Start Date and Time") : t("Date and time")}
          helpTitle={t("Field help")}
          help={t("Times are local to the location chosen for the event.")}
        />
        <GroupedList>
          {draft.dates.map((date) => (
            <GroupedRow key={date.id}>
              <DateTimeInfo
                startsAt={eventLocalToIso(eventDateWall(draft, date), draft.timeZone)}
                timeZone={draft.timeZone}
              />
            </GroupedRow>
          ))}
        </GroupedList>
      </View>
      {publicGroup ? (
        <>
          <View style={{ gap: 8 }}>
            <Typography className="font-semibold text-foreground">
              {t("End Date and Time")}
            </Typography>
            <DateTimeInfo
              startsAt={eventLocalToIso(draft.endsWall, draft.timeZone)}
              timeZone={draft.timeZone}
              timeLabel={t("End time")}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Typography className="font-semibold text-foreground">{t("Booking cutoff")}</Typography>
            <DateTimeInfo
              startsAt={eventLocalToIso(draft.cutoffWall, draft.timeZone)}
              timeZone={draft.timeZone}
              timeLabel={t("Booking cutoff")}
            />
          </View>
        </>
      ) : null}
      <View style={{ gap: 8 }}>
        <SearchHelpLabel
          label={t("Location")}
          helpTitle={t("Field help")}
          help={t("Verified addresses proposed for this event.")}
        />
        <GroupedList>
          {draft.locations.map((location) => (
            <LocationListRow key={location.id} name={location.name} address={location.address} />
          ))}
        </GroupedList>
      </View>
    </View>
  );
}
