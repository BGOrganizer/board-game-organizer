import { type GroupRecordResponse, notificationItemId } from "@board-game-organizer/schemas";
import { groupPendingAction } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CalendarDays, LockKeyhole, LockKeyholeOpen, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { ListCard } from "@/components/common/ui/ListCard";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useT } from "@/lib/i18n";
import { GroupArtwork } from "./GroupArtwork";
import { GroupStatusBadge } from "./GroupStatusBadge";

export function GroupIdentityCard({ group }: { group: GroupRecordResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const muted = useThemeColor("muted");
  const numbers = new Intl.NumberFormat(i18n.locale);
  const Visibility = group.type === "PUBLIC" ? LockKeyholeOpen : LockKeyhole;
  const kind =
    group.role === "admin"
      ? "admin"
      : group.role === "moderator" || group.role === "accepted"
        ? "member"
        : group.role === "invited"
          ? "invitation"
          : group.role === "requested"
            ? "request"
            : "viewer";
  return (
    <ListCard background={<GroupArtwork group={group} status="none" presentation="background" />}>
      <SearchHelpLabel
        label={t("Name")}
        helpTitle={t("Group name help")}
        help={t("Name, logo and group type. Group type cannot be changed.")}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8 }}>
        <UsersRound size={20} color={muted} accessible={false} />
        <Typography
          accessibilityRole="header"
          className="text-lg font-semibold text-foreground"
          style={{ flex: 1, minWidth: 0 }}
        >
          {group.name}
        </Typography>
        <NotificationItem
          itemId={notificationItemId(group.id, "overview", undefined, "group")}
          readOnly
        />
        <GroupStatusBadge group={group} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Visibility size={16} color={muted} accessible={false} />
          <Typography className="text-sm text-foreground">
            {group.type === "PUBLIC" ? t("Public") : t("Private")}
          </Typography>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <UsersRound size={16} color={muted} accessible={false} />
          <Typography className="text-sm text-foreground">
            {numbers.format(group.memberCount)} {t("Confirmed members")}
          </Typography>
        </View>
        {group.canViewEvents && group.eventCount !== null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <CalendarDays size={16} color={muted} accessible={false} />
            <Typography className="text-sm text-foreground">
              {numbers.format(group.eventCount)} {t("Events")}
            </Typography>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <ArtworkStatusPopover
          kind={kind}
          action={groupPendingAction(group)}
          label={
            group.role === "moderator"
              ? t("Group moderator")
              : kind === "admin"
                ? t("Group admin")
                : kind === "request"
                  ? t("Membership requested")
                  : undefined
          }
        />
      </View>
    </ListCard>
  );
}
