import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { eventDateWall, eventRecordPreviewDate } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays, Dices, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
import { EventStatusBadge } from "./EventStatusBadge";
export function EventCard({ event }: { event: PlannedEventResponse }) {
  const t = useT(),
    { i18n } = useLingui(),
    router = useRouter();
  const [fg, muted] = useThemeColor(["foreground", "muted"]);
  const date = eventRecordPreviewDate(event),
    number = new Intl.NumberFormat(i18n.locale);
  const planning = event.status === "PLANNING";
  return (
    <LinkedListCard
      label={`${t("Open event")}: ${event.name}`}
      onPress={() => router.push({ pathname: "/event/[eventId]", params: { eventId: event.id } })}
    >
      <AnimatedDicebearArtwork seed={event.id} variant="waves" />
      <ListCardBody
        title={event.name}
        titleIcon={<CalendarDays size={18} color={fg} />}
        titleAccessory={<EventStatusBadge status={event.status} />}
      >
        {event.groupName ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <UsersRound size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-muted" style={{ flex: 1 }}>
              {event.groupName}
            </Typography>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          {date ? (
            <DateTimeInfo startsAt={`${eventDateWall(event, date)}Z`} timeZone="UTC" />
          ) : (
            <Typography className="text-foreground">{t("Dates to agree")}</Typography>
          )}
          {planning && event.dates.length > 1 ? (
            <Typography
              className="text-sm text-accent"
              accessibilityLabel={i18n._({
                id: "event.proposedDatesCount",
                message: "{count} proposed dates",
                values: { count: number.format(event.dates.length) },
              })}
            >
              +{number.format(event.dates.length)}
            </Typography>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Dices size={16} color={muted} accessible={false} />
            <Typography className="text-foreground">
              {t("Tables")}: {number.format(event.tableCount)}
            </Typography>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <UsersRound size={16} color={muted} accessible={false} />
            <Typography className="text-foreground">
              {t("Players")}: {number.format(event.participantCount)}
            </Typography>
          </View>
        </View>
      </ListCardBody>
    </LinkedListCard>
  );
}
