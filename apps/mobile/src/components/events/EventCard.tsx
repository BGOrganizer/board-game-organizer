import type { ClientEventRecord } from "@board-game-organizer/shared";
import { useNotificationAttentionContext } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { CalendarDays, Dices, RefreshCw, UsersRound } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { ClientRecordBadge, useClientRecordStatus } from "@/components/common/ui/ClientRecordBadge";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
import { EventCardIndicators } from "./EventCardIndicators";

type Props = {
  event: ClientEventRecord;
  context?: "personal" | "group";
  onVerify?: () => void;
  checking?: boolean;
};

export const EventCard = memo(function EventCard(props: Props) {
  const attention = useNotificationAttentionContext();
  const count = props.event.optimistic
    ? undefined
    : attention?.get({ kind: "event", id: props.event.id })?.count;
  return <EventCardContent {...props} notificationCount={count} />;
});

const EventCardContent = memo(function EventCardContent({
  event,
  context = "personal",
  onVerify,
  checking = false,
  notificationCount: count,
}: Props & { notificationCount?: number }) {
  const t = useT();
  const { i18n } = useLingui();
  const router = useRouter();
  const [fg, muted] = useThemeColor(["foreground", "muted"]);
  const local = event.optimistic,
    status = useClientRecordStatus(local?.phase);
  return (
    <LinkedListCard
      heading={
        <ListCardBody
          title={event.name}
          unread={Boolean(count)}
          titleIcon={<CalendarDays size={16} color={muted} accessible={false} />}
          titleAccessory={<ClientRecordBadge phase={local?.phase} iconOnly />}
        />
      }
      label={`${status || t("Open event")}: ${event.name}`}
      disabled={Boolean(local && local.phase !== "failed")}
      notificationCount={count}
      artworkLayout="cover"
      artwork={<AnimatedDicebearArtwork seed={event.id} variant="events" presentation="cover" />}
      leadingActions={<EventCardIndicators event={event} />}
      controlsDisabled={local?.phase === "saving"}
      actions={
        local?.phase === "verifying" && onVerify ? (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            accessibilityLabel={t("Check saved changes")}
            isDisabled={checking}
            onPress={onVerify}
          >
            <RefreshCw size={18} color={fg} />
          </Button>
        ) : undefined
      }
      onPress={() =>
        local
          ? router.push({ pathname: "/event/wizard", params: { draftId: local.draftId } })
          : router.push({
              pathname: "/event/[eventId]",
              params: {
                eventId: event.id,
                ...(context === "group" && event.groupId ? { fromGroup: event.groupId } : {}),
              },
            })
      }
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 6,
          rowGap: 4,
        }}
      >
        {event.groupId ? (
          <>
            <View
              accessible
              accessibilityLabel={`${t("Group")}: ${event.groupName || t("Loading…")}`}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 4,
                maxWidth: "100%",
                flexShrink: 1,
              }}
            >
              <UsersRound size={16} color={muted} accessible={false} />
              {event.groupName ? (
                <Typography className="text-sm text-muted" style={{ flexShrink: 1 }}>
                  {event.groupName}
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
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 4,
            maxWidth: "100%",
            flexShrink: 1,
          }}
        >
          <Dices size={16} color={muted} accessible={false} />
          <Typography className="text-sm text-muted" style={{ flexShrink: 1 }}>
            {i18n._({
              id: "event.card.tables",
              message: "{count, plural, one {# Table} other {# Tables}}",
              values: { count: event.tableCount },
            })}
          </Typography>
        </View>
      </View>
    </LinkedListCard>
  );
});
