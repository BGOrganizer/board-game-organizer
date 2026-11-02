"use client";
import type { ClientGroupRecord } from "@board-game-organizer/shared";
import {
  formatLocationAddress,
  groupPendingAction,
  useNotificationAttentionContext,
} from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  CalendarDays,
  LockKeyhole,
  LockKeyholeOpen,
  MapPin,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { ClientRecordBadge, useClientRecordStatus } from "@/components/common/ui/ClientRecordBadge";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { NotificationUnreadDot } from "@/components/common/ui/NotificationUnreadDot";
import { GroupArtwork } from "./GroupArtwork";
import { GroupStatusBadge } from "./GroupStatusBadge";
export function GroupCard({
  group,
  href = `/groups/${group.id}`,
  onVerify,
  checking = false,
}: {
  group: ClientGroupRecord;
  href?: string;
  onVerify?: () => void;
  checking?: boolean;
}) {
  const { t } = useLingui(),
    attention = useNotificationAttentionContext();
  const attentionTarget = { kind: "group", id: group.id } as const;
  const invited =
    group.myMembership?.kind === "INVITATION" && group.myMembership.status === "PENDING";
  const indicator =
    group.role === "admin"
      ? "admin"
      : group.role === "invited"
        ? "invitation"
        : group.role === "requested"
          ? "request"
          : group.role === "accepted"
            ? "member"
            : null;
  const Visibility = group.type === "PUBLIC" ? LockKeyholeOpen : LockKeyhole;
  const local = group.optimistic,
    status = useClientRecordStatus(local?.phase);
  const target = local
    ? local.phase === "failed"
      ? `/groups/new?draftId=${encodeURIComponent(local.draftId)}`
      : "/groups"
    : href;
  return (
    <LinkedListCard
      href={target}
      notificationCount={local ? undefined : attention?.get(attentionTarget)?.count}
      leadingActions={
        indicator ? (
          <ArtworkStatusPopover
            kind={indicator}
            action={local ? null : groupPendingAction(group)}
            label={
              indicator === "admin"
                ? t`Group admin`
                : indicator === "request"
                  ? t`Membership requested`
                  : undefined
            }
          />
        ) : undefined
      }
      disabled={Boolean(local && local.phase !== "failed")}
      label={`${status || t`Open group`}: ${group.name}`}
      actions={
        local?.phase === "verifying" && onVerify ? (
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Check saved changes`}
            isDisabled={checking}
            onPress={onVerify}
          >
            <RefreshCw className="size-4" aria-hidden />
          </Button>
        ) : undefined
      }
    >
      <GroupArtwork group={group} status="none" />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 truncate font-semibold">{group.name}</span>
            <NotificationUnreadDot
              active={!local && Boolean(attention?.get(attentionTarget)?.count)}
            />
          </span>
          {local ? <ClientRecordBadge phase={local.phase} /> : <GroupStatusBadge group={group} />}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <Visibility className="size-3" aria-hidden />
          {group.type === "PUBLIC" ? t`Public` : t`Private`}
        </span>
        {group.location ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 break-words">
              {formatLocationAddress(group.location.address)}
            </span>
          </span>
        ) : null}
        <span
          className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted ${local?.phase === "verifying" && onVerify ? "pr-10" : ""}`}
        >
          <span className="flex items-center gap-1">
            <UsersRound className="size-4" aria-hidden />
            {group.memberCount} {t`members`}
          </span>
          {group.canViewEvents && group.eventCount !== null ? (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-4" aria-hidden />
              {group.eventCount} {t`Events`}
            </span>
          ) : null}
        </span>
        {invited ? (
          <span className="block text-xs text-warning">{t`Invitation received`}</span>
        ) : group.role === "requested" ? (
          <span className="block text-xs text-warning">{t`Membership requested`}</span>
        ) : null}
      </span>
    </LinkedListCard>
  );
}
