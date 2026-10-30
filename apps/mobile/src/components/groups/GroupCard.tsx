import type { ClientGroupRecord } from "@board-game-organizer/shared";
import { formatLocationAddress } from "@board-game-organizer/shared";
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
import { ClientRecordBadge, useClientRecordStatus } from "@/components/common/ui/ClientRecordBadge";
import { InvitationActions } from "@/components/common/ui/InvitationActions";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { useT } from "@/lib/i18n";
import { GroupArtwork } from "./GroupArtwork";
import { GroupStatusBadge } from "./GroupStatusBadge";
export function GroupCard({
  group,
  pending = false,
  onRespond,
  href,
  onVerify,
  checking = false,
}: {
  group: ClientGroupRecord;
  pending?: boolean;
  onRespond?: (action: "accept" | "decline") => void;
  href?: Href;
  onVerify?: () => void;
  checking?: boolean;
}) {
  const t = useT(),
    router = useRouter(),
    muted = useThemeColor("muted");
  const invited =
    group.myMembership?.kind === "INVITATION" && group.myMembership.status === "PENDING";
  const Visibility = group.type === "PUBLIC" ? LockKeyholeOpen : LockKeyhole;
  const local = group.optimistic,
    status = useClientRecordStatus(local?.phase);
  return (
    <LinkedListCard
      label={`${status || t("Open group")}: ${group.name}`}
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
        ) : invited && onRespond ? (
          <InvitationActions
            placement="card"
            name={group.name}
            pending={pending}
            onAccept={() => onRespond("accept")}
            onDecline={() => onRespond("decline")}
          />
        ) : undefined
      }
    >
      <GroupArtwork group={group} />
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
            paddingRight:
              invited && onRespond ? 88 : local?.phase === "verifying" && onVerify ? 40 : 0,
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
