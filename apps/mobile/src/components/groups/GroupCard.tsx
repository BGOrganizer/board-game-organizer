import type { ClientGroupRecord } from "@board-game-organizer/shared";
import {
  formatLocationAddress,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { type Href, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  CalendarDays,
  LockKeyhole,
  LockKeyholeOpen,
  MapPin,
  RefreshCw,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { ClientRecordBadge, useClientRecordStatus } from "@/components/common/ui/ClientRecordBadge";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
import { GroupArtwork } from "./GroupArtwork";
import { GroupStatusBadge } from "./GroupStatusBadge";
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
  const attention = useNotificationAttentionContext(),
    attentionTarget = { kind: "group", id: group.id } as const;
  const invited =
    group.myMembership?.kind === "INVITATION" && group.myMembership.status === "PENDING";
  const indicator =
    group.role === "admin"
      ? "admin"
      : group.role === "invited"
        ? "invitation"
        : group.role === "requested"
          ? "request"
          : null;
  const Visibility = group.type === "PUBLIC" ? LockKeyholeOpen : LockKeyhole;
  const local = group.optimistic,
    status = useClientRecordStatus(local?.phase);
  return (
    <LinkedListCard
      label={`${status || t("Open group")}: ${group.name}`}
      disabled={Boolean(local && local.phase !== "failed")}
      notificationCount={local ? undefined : attention?.get(attentionTarget)?.count}
      leadingActions={
        indicator ? (
          <ArtworkStatusPopover
            kind={indicator}
            label={
              indicator === "admin"
                ? t("Group admin")
                : indicator === "request"
                  ? t("Membership requested")
                  : t("Invitation received")
            }
          />
        ) : undefined
      }
      onPress={() => {
        return local
          ? router.push({ pathname: "/group/wizard", params: { draftId: local.draftId } })
          : router.push(href ?? { pathname: "/group/[groupId]", params: { groupId: group.id } });
      }}
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
      <GroupArtwork group={group} status="none" />
      <ListCardBody
        title={group.name}
        titleAccessory={
          local ? <ClientRecordBadge phase={local.phase} /> : <GroupStatusBadge group={group} />
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Visibility size={14} color={muted} accessible={false} />
          <Typography className="text-muted" style={{ fontSize: 12 }}>
            {group.type === "PUBLIC" ? t("Public") : t("Private")}
          </Typography>
        </View>
        {group.location ? (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
            <MapPin size={14} color={muted} accessible={false} />
            <Typography className="text-muted" style={{ fontSize: 13, flex: 1, flexShrink: 1 }}>
              {formatLocationAddress(group.location.address)}
            </Typography>
          </View>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            paddingRight: local?.phase === "verifying" && onVerify ? 40 : 0,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <UsersRound size={14} color={muted} accessible={false} />
            <Typography className="text-muted" style={{ fontSize: 13 }}>
              {group.memberCount} {t("members")}
            </Typography>
          </View>
          {group.canViewEvents && group.eventCount !== null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <CalendarDays size={14} color={muted} accessible={false} />
              <Typography className="text-muted" style={{ fontSize: 13 }}>
                {group.eventCount} {t("Events")}
              </Typography>
            </View>
          ) : null}
        </View>
        {invited ? (
          <Typography className="text-warning" style={{ fontSize: 12 }}>
            {t("Invitation received")}
          </Typography>
        ) : group.role === "requested" ? (
          <Typography className="text-warning" style={{ fontSize: 12 }}>
            {t("Membership requested")}
          </Typography>
        ) : null}
      </ListCardBody>
    </LinkedListCard>
  );
}
