import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  CalendarDays,
  LockKeyhole,
  LockKeyholeOpen,
  MapPin,
  UsersRound,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { InfoSection } from "@/components/common/ui/InfoSection";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { useT } from "@/lib/i18n";
import { GroupArtwork } from "./GroupArtwork";
import { GroupStatusBadge } from "./GroupStatusBadge";
export function GroupDetailsCard({
  group,
  children,
}: {
  group: GroupRecordResponse;
  children?: ReactNode;
}) {
  const t = useT(),
    { i18n } = useLingui(),
    muted = useThemeColor("muted");
  const numbers = new Intl.NumberFormat(i18n.locale),
    Visibility = group.type === "PUBLIC" ? LockKeyholeOpen : LockKeyhole;
  return (
    <View style={{ gap: 16 }}>
      <InfoSection
        label={t("Name")}
        helpLabel={t("Group name help")}
        help={t("Name, logo and group type. Group type cannot be changed.")}
        icon={UsersRound}
        headerAccessory={<GroupStatusBadge group={group} />}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <GroupArtwork group={group} />
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <Typography className="font-semibold text-foreground">{group.name}</Typography>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Visibility size={14} color={muted} accessible={false} />
              <Typography className="text-muted">
                {group.type === "PUBLIC" ? t("Public") : t("Private")}
              </Typography>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <UsersRound size={14} color={muted} accessible={false} />
                <Typography className="text-foreground">
                  {numbers.format(group.memberCount)} {t("Confirmed members")}
                </Typography>
              </View>
              {group.canViewEvents && group.eventCount !== null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <CalendarDays size={14} color={muted} accessible={false} />
                  <Typography className="text-foreground">
                    {numbers.format(group.eventCount)} {t("Events")}
                  </Typography>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </InfoSection>
      {group.location ? (
        <InfoSection
          label={t("Group venue")}
          helpLabel={t("Group venue help")}
          help={t("The group's verified venue and full address.")}
          icon={MapPin}
        >
          <LocationListRow name={group.location.name} address={group.location.address} />
        </InfoSection>
      ) : null}
      {group.rejectionReason ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {group.rejectionReason}
        </Typography>
      ) : null}
      {group.approved && group.reviewStatus ? (
        <Typography className="text-muted">
          {t("Approved information remains visible while changes are reviewed.")}
        </Typography>
      ) : null}
      {children ? (
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}
