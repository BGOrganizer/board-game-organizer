import type { ClientGroupRecord } from "@board-game-organizer/shared";
import { useNotificationAttentionContext } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { type Href, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays, RefreshCw, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { ClientRecordBadge, useClientRecordStatus } from "@/components/common/ui/ClientRecordBadge";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
import { GroupArtwork } from "./GroupArtwork";
import { GroupCardIndicators } from "./GroupCardIndicators";

export function GroupCard({
  group,
  href,
  onVerify,
  checking = false,
}: {
  group: ClientGroupRecord;
  href?: Href;
  onVerify?: () => void;
  checking?: boolean;
}) {
  const t = useT(),
    router = useRouter(),
    muted = useThemeColor("muted");
  const { i18n } = useLingui();
  const attention = useNotificationAttentionContext();
  const local = group.optimistic,
    status = useClientRecordStatus(local?.phase);
  const count = local ? undefined : attention?.get({ kind: "group", id: group.id })?.count;
  const events = group.canViewEvents && group.eventCount !== null;
  return (
    <LinkedListCard
      label={`${status || t("Open group")}: ${group.name}`}
      notificationCount={count}
      artworkLayout="cover"
      artwork={<GroupArtwork group={group} status="none" presentation="cover" />}
      leadingActions={local ? undefined : <GroupCardIndicators group={group} />}
      disabled={Boolean(local && local.phase !== "failed")}
      onPress={() =>
        local
          ? router.push({ pathname: "/group/wizard", params: { draftId: local.draftId } })
          : router.push(href ?? { pathname: "/group/[groupId]", params: { groupId: group.id } })
      }
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
            <RefreshCw size={18} color={muted} />
          </Button>
        ) : undefined
      }
    >
      <ListCardBody
        title={group.name}
        titleIcon={<UsersRound size={16} color={muted} accessible={false} />}
        unread={Boolean(count)}
        titleAccessory={local ? <ClientRecordBadge phase={local.phase} /> : undefined}
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 4,
              maxWidth: "100%",
              flexShrink: 1,
            }}
          >
            <UsersRound size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-muted" style={{ flexShrink: 1 }}>
              {i18n._({
                id: "group.card.members",
                message: "{count, plural, one {# Member} other {# Members}}",
                values: { count: group.memberCount },
              })}
            </Typography>
          </View>
          {events ? (
            <>
              <Typography accessible={false} className="text-sm text-muted">
                ·
              </Typography>
              <View
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
                  {i18n._({
                    id: "group.card.events",
                    message: "{count, plural, one {# Event} other {# Events}}",
                    values: { count: group.eventCount },
                  })}
                </Typography>
              </View>
            </>
          ) : null}
        </View>
      </ListCardBody>
    </LinkedListCard>
  );
}
