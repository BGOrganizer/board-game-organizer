import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventRecordDay } from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays } from "lucide-react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
export function EventCard({ event }: { event: PlannedEventResponse }) {
  const t = useT(),
    router = useRouter(),
    fg = useThemeColor("foreground"),
    day = eventRecordDay(event, event.groupType);
  return (
    <LinkedListCard
      label={`${t("Open event")}: ${event.name}`}
      onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: event.id } })}
    >
      <AnimatedDicebearArtwork seed={event.id} variant="waves" />
      <ListCardBody title={event.name} titleIcon={<CalendarDays size={18} color={fg} />}>
        <Typography className="text-sm text-muted">
          {event.status === "PLANNING"
            ? t("Planning")
            : event.status === "CONFIRMED"
              ? t("Confirmed")
              : t("Terminated")}
          {event.groupName ? ` · ${event.groupName}` : ""}
        </Typography>
        <Typography className="text-foreground">
          {day ?? t("Dates to agree")} · {event.startTime} ({event.timeZone})
        </Typography>
        <Typography className="text-foreground">
          {t("Tables")}: {event.tableCount} · {t("Players")}: {event.participantCount}
        </Typography>
      </ListCardBody>
    </LinkedListCard>
  );
}
