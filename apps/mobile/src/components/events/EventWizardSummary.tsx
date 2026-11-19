import {
  type EventRecordDraft,
  eventDateWall,
  eventSummaryWallTime,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { Hand, Sparkles, TriangleAlert, Trophy, Users } from "lucide-react-native";
import { View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
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
  const muted = useThemeColor("muted"),
    warning = useThemeColor("warning");
  const PlanningIcon = draft.planningMode === "MANUAL" ? Hand : Sparkles;
  const PreferenceIcon = draft.playerPreference === "BEST" ? Trophy : Users;
  return (
    <View style={{ gap: 20 }}>
      <Typography accessibilityRole="header" className="text-xl font-bold text-foreground">
        {draft.name}
      </Typography>
      <View style={{ gap: 8 }}>
        <Typography accessibilityRole="header" className="font-semibold text-foreground">
          {t("Group")}
        </Typography>
        <Typography className="text-foreground">{groupName ?? t("No group")}</Typography>
      </View>
      <View style={{ gap: 8 }}>
        <Typography accessibilityRole="header" className="font-semibold text-foreground">
          {t("Settings")}
        </Typography>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <PlanningIcon size={20} color={muted} accessible={false} />
          <Typography className="text-foreground" style={{ flex: 1 }}>
            {draft.planningMode === "MANUAL" ? t("Manual") : t("Assisted")}
          </Typography>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <PreferenceIcon size={20} color={muted} accessible={false} />
          <Typography className="text-foreground" style={{ flex: 1 }}>
            {draft.playerPreference === "BEST" ? t("BGG Best") : t("Players")}
          </Typography>
        </View>
        {draft.playerPreference === "BEST" ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <TriangleAlert size={20} color={warning} accessible={false} />
            <Typography className="text-foreground" style={{ flex: 1 }}>
              {t("BGG Best allows reducing the seated group in Assisted planning.")}
            </Typography>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
        <Typography accessibilityRole="header" className="font-semibold text-foreground">
          {publicGroup ? t("Date and start/end time") : t("Dates and times")}
        </Typography>
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
        <Typography accessibilityRole="header" className="font-semibold text-foreground">
          {t("Locations")}
        </Typography>
        <GroupedList>
          {draft.locations.map((location) => (
            <LocationListRow key={location.id} name={location.name} address={location.address} />
          ))}
        </GroupedList>
      </View>
      <Typography accessibilityRole="header" className="font-semibold text-foreground">
        {t("Table list")}
      </Typography>
    </View>
  );
}
