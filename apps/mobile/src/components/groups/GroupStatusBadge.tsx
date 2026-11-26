import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { groupReviewState } from "@board-game-organizer/shared";
import { Chip } from "heroui-native/chip";
import { useThemeColor } from "heroui-native/hooks";
import { Typography } from "heroui-native/text";
import { CircleAlert, CircleCheck, CircleX, Clock3 } from "lucide-react-native";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { useT } from "@/lib/i18n";

const appearance = {
  approved: {
    label: "group.review.approved",
    description: "This public group is approved.",
    icon: CircleCheck,
    tone: "success",
    variant: "ghost",
    color: "success-soft-foreground",
  },
  pending: {
    label: "Awaiting review",
    description: "This public group is awaiting review.",
    icon: Clock3,
    tone: "warning",
    variant: "ghost",
    color: "warning-soft-foreground",
  },
  changesRejected: {
    label: "Changes rejected",
    description: "These changes were rejected.",
    icon: CircleAlert,
    tone: "danger",
    variant: "danger-soft",
    color: "danger-soft-foreground",
  },
  approvalRejected: {
    label: "Approval rejected",
    description: "The approval request was rejected. This group has not been published.",
    icon: CircleX,
    tone: "danger",
    variant: "danger",
    color: "danger-foreground",
  },
} as const;

export function GroupStatusBadge({
  group,
  withPopover = false,
}: {
  group: Pick<GroupRecordResponse, "type" | "reviewStatus" | "approved" | "rejectionReason">;
  withPopover?: boolean;
}) {
  const t = useT();
  const { height } = useWindowDimensions();
  const status = groupReviewState(group);
  const { label, description, icon: Icon, tone, variant, color } = appearance[status];
  const foreground = useThemeColor(color);
  if (group.type !== "PUBLIC") return null;
  const title = t(label);
  if (!withPopover)
    return (
      <Chip
        size="sm"
        color={tone}
        variant={variant === "danger" ? "primary" : "soft"}
        style={{
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <Icon size={14} color={foreground} accessible={false} />
        <Chip.Label numberOfLines={1} style={{ flexShrink: 0, paddingEnd: 2 }}>
          {title}
        </Chip.Label>
      </Chip>
    );

  return (
    <HelpPopover
      size="compact"
      label={title}
      title={title}
      icon={Icon}
      tone={tone}
      triggerVariant={variant}
      triggerClassName="bg-default"
      width="content-fit"
    >
      <ScrollView
        style={{ maxHeight: Math.min(320, height * 0.5) }}
        contentContainerStyle={{ gap: 8 }}
      >
        <Typography className="text-foreground">{t(description)}</Typography>
        {status === "pending" && group.approved ? (
          <Typography className="text-foreground">
            {t("Approved information remains visible while changes are reviewed.")}
          </Typography>
        ) : null}
        {status === "changesRejected" ? (
          <Typography className="text-foreground">
            {t("The approved version remains visible.")}
          </Typography>
        ) : null}
        {group.reviewStatus === "REJECTED" && group.rejectionReason ? (
          <View>
            <Typography className="font-bold text-foreground">{t("Rejection reason")}</Typography>
            <Typography className="text-foreground">{group.rejectionReason}</Typography>
          </View>
        ) : null}
      </ScrollView>
    </HelpPopover>
  );
}
