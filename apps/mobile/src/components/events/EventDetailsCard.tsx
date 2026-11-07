import { notificationItemId, type PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventRecordVisibility } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays, Info } from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useT } from "@/lib/i18n";
import { EventStatusBadge } from "./EventStatusBadge";
import { EventVoteLegend } from "./EventVoteLegend";

export function EventDetailsCard({ event }: { event: PlannedEventResponse }) {
  const t = useT();
  const muted = useThemeColor("muted");
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Info size={20} color={muted} accessible={false} />
        <Typography className="font-bold text-foreground">{t("Details")}</Typography>
        <EventVoteLegend />
      </View>
      <ListCard>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16, padding: 16 }}>
          <AnimatedDicebearArtwork seed={event.id} variant="constellation" />
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <View
              style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexBasis: 208,
                  flexGrow: 1,
                  flexShrink: 1,
                  minWidth: 0,
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <CalendarDays size={16} color={muted} accessible={false} style={{ marginTop: 2 }} />
                <Typography
                  accessibilityRole="header"
                  className="text-base font-normal text-foreground"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {event.name}
                </Typography>
                <NotificationItem itemId={notificationItemId(event.id, "overview")} readOnly />
              </View>
              <EventStatusBadge status={event.status} />
            </View>
            <Typography className="text-sm text-muted">
              {eventRecordVisibility(event, event.groupType) === "PUBLIC"
                ? t("Public event")
                : t("Private event")}
            </Typography>
          </View>
        </View>
      </ListCard>
    </View>
  );
}
