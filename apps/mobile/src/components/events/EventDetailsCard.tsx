import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventParticipation, eventRecordVisibility } from "@board-game-organizer/shared";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays } from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { ListCard } from "@/components/common/ui/ListCard";
import { useT } from "@/lib/i18n";
import { EventStatusBadge } from "./EventStatusBadge";

export function EventDetailsCard({ event }: { event: PlannedEventResponse }) {
  const t = useT();
  const muted = useThemeColor("muted");
  const participation = eventParticipation(event.myRegistrations);
  const manager = !event.readOnly && (event.canManage ?? event.role === "admin");
  return (
    <ListCard
      background={
        <AnimatedDicebearArtwork
          seed={event.id}
          variant="constellation"
          presentation="background"
        />
      }
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 }}>
        <CalendarDays size={20} color={muted} accessible={false} />
        <Typography
          accessibilityRole="header"
          className="text-lg font-semibold text-foreground"
          style={{ flex: 1, minWidth: 0 }}
        >
          {event.name}
        </Typography>
        <EventStatusBadge status={event.status} />
      </View>
      <Typography className="text-sm text-muted">
        {eventRecordVisibility(event, event.groupType) === "PUBLIC"
          ? t("Public event")
          : t("Private event")}
      </Typography>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
        {manager ? <ArtworkStatusPopover kind="manager" /> : null}
        {participation !== null ? (
          <ArtworkStatusPopover kind={participation} />
        ) : !manager ? (
          <ArtworkStatusPopover kind={event.role === "member" ? "member" : "viewer"} />
        ) : null}
        {event.myDemonstrator ? <ArtworkStatusPopover kind="demonstrator" /> : null}
      </View>
    </ListCard>
  );
}
