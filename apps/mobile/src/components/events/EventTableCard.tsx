import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useNotificationAttentionContext } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarDays, Dices, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
import { EventTableCardIndicators } from "./EventTableCardIndicators";

export function EventTableCard({
  table,
  context = "personal",
}: {
  table: PlannedTableResponse;
  context?: "personal" | "event";
}) {
  const t = useT();
  const { i18n } = useLingui();
  const router = useRouter();
  const muted = useThemeColor("muted");
  const attention = useNotificationAttentionContext();
  const count = attention?.get({ kind: "table", id: table.id })?.count;
  return (
    <LinkedListCard
      label={`${t("Open table")}: ${table.name}`}
      notificationCount={count}
      onPress={() =>
        router.push({
          pathname: "/event/table",
          params: {
            eventId: table.eventId,
            tableId: table.id,
            ...(context === "event" ? { fromEvent: table.eventId } : {}),
          },
        })
      }
      artworkLayout="cover"
      artwork={<AnimatedDicebearArtwork seed={table.id} variant="planets" presentation="cover" />}
      leadingActions={<EventTableCardIndicators table={table} />}
    >
      <ListCardBody
        title={table.name}
        unread={Boolean(count)}
        titleIcon={<Dices size={16} color={muted} accessible={false} />}
      >
        <Typography className="text-sm text-foreground">
          {i18n._({
            id: "table.card.participants",
            message:
              "{count, plural, one {#/{capacity} participant} other {#/{capacity} participants}}",
            values: { count: table.seatedCount, capacity: i18n.number(table.maxPlayers) },
          })}
        </Typography>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 6,
            rowGap: 4,
          }}
        >
          {table.groupId ? (
            <>
              <View
                accessible
                accessibilityLabel={`${t("Group")}: ${table.groupName || t("Loading…")}`}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 4,
                  maxWidth: "100%",
                  flexShrink: 1,
                }}
              >
                <UsersRound size={16} color={muted} accessible={false} />
                {table.groupName ? (
                  <Typography className="text-sm text-muted" style={{ flexShrink: 1 }}>
                    {table.groupName}
                  </Typography>
                ) : (
                  <Skeleton style={{ width: 112, height: 16, borderRadius: 4 }} />
                )}
              </View>
              <Typography accessible={false} className="text-sm text-muted">
                ·
              </Typography>
            </>
          ) : null}
          <View
            accessible
            accessibilityLabel={`${t("Event")}: ${table.eventName}`}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 4,
              maxWidth: "100%",
              flexShrink: 1,
            }}
          >
            <CalendarDays size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-muted" style={{ flexShrink: 1 }}>
              {table.eventName}
            </Typography>
          </View>
        </View>
      </ListCardBody>
    </LinkedListCard>
  );
}
