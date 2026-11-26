"use client";
import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { groupReviewState } from "@board-game-organizer/shared";
import { Chip } from "@heroui/react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { CircleAlert, CircleCheck, CircleX, Clock3 } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";

const appearance = {
  approved: {
    label: msg({ id: "group.review.approved", message: "Approved" }),
    description: msg`This public group is approved.`,
    icon: CircleCheck,
    tone: "success",
    variant: "ghost",
  },
  pending: {
    label: msg`Awaiting review`,
    description: msg`This public group is awaiting review.`,
    icon: Clock3,
    tone: "warning",
    variant: "ghost",
  },
  changesRejected: {
    label: msg`Changes rejected`,
    description: msg`These changes were rejected.`,
    icon: CircleAlert,
    tone: "danger",
    variant: "danger-soft",
  },
  approvalRejected: {
    label: msg`Approval rejected`,
    description: msg`The approval request was rejected. This group has not been published.`,
    icon: CircleX,
    tone: "danger",
    variant: "danger",
  },
} as const;

export function GroupStatusBadge({
  group,
  withPopover = false,
}: {
  group: Pick<GroupRecordResponse, "type" | "reviewStatus" | "approved" | "rejectionReason">;
  withPopover?: boolean;
}) {
  const { t, i18n } = useLingui();
  if (group.type !== "PUBLIC") return null;
  const status = groupReviewState(group);
  const { label, description, icon: Icon, tone, variant } = appearance[status];
  const title = i18n._(label);
  if (!withPopover)
    return (
      <Chip size="sm" color={tone} variant={variant === "danger" ? "primary" : "soft"}>
        <Icon className="size-3" aria-hidden />
        {title}
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
      className="w-[min(24rem,calc(100vw-2rem))]"
    >
      <div className="max-h-[50vh] space-y-2 overflow-y-auto overscroll-contain">
        <p>{i18n._(description)}</p>
        {status === "pending" && group.approved ? (
          <p>{t`Approved information remains visible while changes are reviewed.`}</p>
        ) : null}
        {status === "changesRejected" ? <p>{t`The approved version remains visible.`}</p> : null}
        {group.reviewStatus === "REJECTED" && group.rejectionReason ? (
          <div>
            <p className="font-bold">{t`Rejection reason`}</p>
            <p className="[overflow-wrap:anywhere]">{group.rejectionReason}</p>
          </div>
        ) : null}
      </div>
    </HelpPopover>
  );
}
