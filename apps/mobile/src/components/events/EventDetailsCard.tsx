import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarDays, Info, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ListCard } from "@/components/common/ui/ListCard";
import { useT } from "@/lib/i18n";
import { EventStatusBadge } from "./EventStatusBadge";
import { EventVoteLegend } from "./EventVoteLegend";

export function EventDetailsCard({ event }: { event: PlannedEventResponse }) {
  const t = useT();
  const router = useRouter();
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
          <AnimatedDicebearArtwork seed={event.id} variant="waves" />
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <CalendarDays size={16} color={muted} accessible={false} style={{ marginTop: 2 }} />
              <Typography
                accessibilityRole="header"
                className="text-base font-normal text-foreground"
                style={{ flex: 1 }}
              >
                {event.name}
              </Typography>
              <EventStatusBadge status={event.status} />
            </View>
            {event.groupId ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <UsersRound size={16} color={muted} accessible={false} />
                {event.groupName ? (
                  <Button
                    variant="ghost"
                    style={{ flex: 1, justifyContent: "flex-start", paddingHorizontal: 0 }}
                    onPress={() => {
                      if (event.groupId)
                        router.push({
                          pathname: "/group/[groupId]",
                          params: { groupId: event.groupId },
                        });
                    }}
                  >
                    <Button.Label numberOfLines={2}>{event.groupName}</Button.Label>
                  </Button>
                ) : (
                  <Skeleton style={{ width: 128, height: 16, borderRadius: 4 }} />
                )}
              </View>
            ) : null}
          </View>
        </View>
      </ListCard>
    </View>
  );
}
