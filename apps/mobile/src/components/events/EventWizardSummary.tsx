import {
  type EventRecordDraft,
  eventDateWall,
  eventSummaryWallTime,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
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
  const t = useT(),
    { i18n } = useLingui();
  return (
    <View style={{ gap: 20 }}>
      <Typography accessibilityRole="header" className="text-xl font-bold text-foreground">
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
        <Typography>{t("Settings")}</Typography>
        <Typography>{draft.planningMode === "MANUAL" ? t("Manual") : t("Assisted")}</Typography>
        <Typography>
          {draft.playerPreference === "BEST" ? t("Ideal count") : t("More players")}
        </Typography>
        {draft.playerPreference === "BEST" ? (
          <Typography>
            {draft.allowBestReduction
              ? t("Allow reduction for Best")
              : t("Preserve seated players")}
          </Typography>
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
        <SearchHelpLabel
          label={publicGroup ? t("Date and start/end time") : t("Dates and times")}
          helpTitle={t("Field help")}
          help={t("Times are local to the location chosen for the event.")}
        />
        <GroupedList>
          {draft.dates.map((date) => (
            <GroupedRow key={date.id}>
              <Typography className="text-sm text-foreground" style={{ flex: 1, minWidth: 0 }}>
                {eventSummaryWallTime(
                  eventDateWall(draft, date),
                  i18n.locale,
                  publicGroup ? draft.endsWall : undefined,
                )}
              </Typography>
            </GroupedRow>
          ))}
        </GroupedList>
      </View>
      {publicGroup ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="header" className="font-semibold text-foreground">
            {t("Registration Deadline Date and Time")}
          </Typography>
          <GroupedList>
            <GroupedRow>
              <Typography className="text-sm text-foreground" style={{ flex: 1, minWidth: 0 }}>
                {eventSummaryWallTime(draft.cutoffWall, i18n.locale)}
              </Typography>
            </GroupedRow>
          </GroupedList>
        </View>
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
