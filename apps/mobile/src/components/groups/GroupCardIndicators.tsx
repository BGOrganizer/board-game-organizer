import type { ClientGroupRecord } from "@board-game-organizer/shared";
import { formatLocationAddress, groupPendingAction } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import {
  CalendarDays,
  CircleCheck,
  CircleX,
  Clock3,
  Globe,
  LockKeyhole,
  MapPin,
  UsersRound,
} from "lucide-react-native";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

export function GroupCardIndicators({ group }: { group: ClientGroupRecord }) {
  const t = useT();
  const muted = useThemeColor("muted");
  const { i18n } = useLingui();
  const { height } = useWindowDimensions();
  const publicGroup = group.type === "PUBLIC";
  const indicator = group.optimistic
    ? null
    : group.role === "admin"
      ? "admin"
      : group.role === "moderator"
        ? "manager"
        : group.role === "accepted"
          ? "member"
          : group.role === "invited"
            ? "invitation"
            : group.role === "requested"
              ? "request"
              : null;
  const visibility = publicGroup ? t("Public") : t("Private");
  const rejected = group.reviewStatus === "REJECTED";
  const pending = !group.approved || group.reviewStatus === "PENDING";
  const review = rejected ? t("Changes rejected") : pending ? t("Awaiting review") : t("Approved");
  return (
    <>
      {indicator ? (
        <ArtworkStatusPopover
          size="compact"
          kind={indicator}
          action={groupPendingAction(group)}
          label={
            group.role === "admin"
              ? t("Admin")
              : group.role === "moderator"
                ? t("Moderator")
                : group.role === "requested"
                  ? t("Member with pending request")
                  : group.role === "invited"
                    ? t("Member with pending invitation")
                    : t("Accepted member")
          }
        />
      ) : null}
      <HelpPopover
        size="compact"
        label={visibility}
        title={visibility}
        icon={publicGroup ? Globe : LockKeyhole}
        tone={publicGroup ? "accent" : "muted"}
        triggerClassName="bg-default"
        width="content-fit"
      >
        <ScrollView
          style={{ maxHeight: Math.min(320, height * 0.5) }}
          contentContainerStyle={{ gap: 8 }}
        >
          <Typography className="text-foreground">
            {publicGroup
              ? t("Public groups accept membership requests.")
              : t("Private groups are invitation-only.")}
          </Typography>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <UsersRound size={16} color={muted} accessible={false} />
            <Typography className="text-foreground" style={{ flex: 1 }}>
              {i18n._({
                id: "group.card.members",
                message: "{count, plural, one {# Member} other {# Members}}",
                values: { count: group.memberCount },
              })}
            </Typography>
          </View>
          {group.canViewEvents && group.eventCount !== null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <CalendarDays size={16} color={muted} accessible={false} />
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {i18n._({
                  id: "group.card.events",
                  message: "{count, plural, one {# Event} other {# Events}}",
                  values: { count: group.eventCount },
                })}
              </Typography>
            </View>
          ) : null}
          {group.location ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <MapPin size={16} color={muted} accessible={false} />
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {formatLocationAddress(group.location.address)}
              </Typography>
            </View>
          ) : null}
        </ScrollView>
      </HelpPopover>
      {publicGroup && !group.optimistic ? (
        <HelpPopover
          size="compact"
          label={review}
          title={review}
          icon={rejected ? CircleX : pending ? Clock3 : CircleCheck}
          tone={rejected ? "danger" : pending ? "warning" : "success"}
          triggerClassName="bg-default"
          width="content-fit"
        >
          <ScrollView
            style={{ maxHeight: Math.min(320, height * 0.5) }}
            contentContainerStyle={{ gap: 8 }}
          >
            <Typography className="text-foreground">
              {rejected
                ? t("These changes were rejected.")
                : pending
                  ? t("This public group is awaiting review.")
                  : t("This public group is approved.")}
            </Typography>
            {pending && group.approved && !rejected ? (
              <Typography className="text-foreground">
                {t("Approved information remains visible while changes are reviewed.")}
              </Typography>
            ) : null}
            {rejected && group.rejectionReason ? (
              <Typography className="text-foreground">{group.rejectionReason}</Typography>
            ) : null}
          </ScrollView>
        </HelpPopover>
      ) : null}
    </>
  );
}
