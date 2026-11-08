import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { formatLocationAddress, groupPendingAction } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { Typography } from "heroui-native/text";
import { CircleCheck, CircleX, Clock3, Globe, LockKeyhole } from "lucide-react-native";
import { ScrollView, useWindowDimensions } from "react-native";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

export function GroupCardIndicators({ group }: { group: GroupRecordResponse }) {
  const t = useT();
  const { i18n } = useLingui();
  const { width, height } = useWindowDimensions();
  const publicGroup = group.type === "PUBLIC";
  const indicator =
    group.role === "admin"
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
              ? t("Group admin")
              : group.role === "moderator"
                ? t("Group moderator")
                : group.role === "requested"
                  ? t("Membership requested")
                  : undefined
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
        width={Math.min(360, width - 32)}
      >
        <ScrollView
          style={{ maxHeight: Math.min(320, height * 0.5) }}
          contentContainerStyle={{ gap: 8 }}
        >
          <Typography className="text-foreground">
            {publicGroup
              ? t(
                  "Public groups require a logo, verified venue and approval. Group type cannot be changed.",
                )
              : t(
                  "Private groups are invitation-only. Logo and verified venue are optional. Group type cannot be changed.",
                )}
          </Typography>
          <Typography className="text-foreground">
            {t("Name, logo and group type. Group type cannot be changed.")}
          </Typography>
          <Typography className="text-foreground">
            {i18n._({
              id: "group.card.members",
              message: "{count, plural, one {# Member} other {# Members}}",
              values: { count: group.memberCount },
            })}
          </Typography>
          {group.canViewEvents && group.eventCount !== null ? (
            <Typography className="text-foreground">
              {i18n._({
                id: "group.card.events",
                message: "{count, plural, one {# Event} other {# Events}}",
                values: { count: group.eventCount },
              })}
            </Typography>
          ) : null}
          {group.location ? (
            <Typography className="text-foreground">
              {formatLocationAddress(group.location.address)}
            </Typography>
          ) : null}
        </ScrollView>
      </HelpPopover>
      {publicGroup ? (
        <HelpPopover
          size="compact"
          label={review}
          title={review}
          icon={rejected ? CircleX : pending ? Clock3 : CircleCheck}
          tone={rejected ? "danger" : pending ? "warning" : "success"}
          triggerClassName="bg-default"
          width={Math.min(360, width - 32)}
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
