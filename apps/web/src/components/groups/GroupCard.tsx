"use client";

import type { ClientGroupRecord } from "@board-game-organizer/shared";
import { useNotificationAttentionContext } from "@board-game-organizer/shared";
import { Button } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, RefreshCw, UsersRound } from "lucide-react";
import { ClientRecordBadge, useClientRecordStatus } from "@/components/common/ui/ClientRecordBadge";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { GroupArtwork } from "./GroupArtwork";
import { GroupCardIndicators } from "./GroupCardIndicators";

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
  const { t, i18n } = useLingui();
  const attention = useNotificationAttentionContext();
  const local = group.optimistic,
    status = useClientRecordStatus(local?.phase);
  const count = local ? undefined : attention?.get({ kind: "group", id: group.id })?.count;
  const target = local
    ? local.phase === "failed"
      ? `/groups/new?draftId=${encodeURIComponent(local.draftId)}`
      : "/groups"
    : href;
  const events = group.canViewEvents && group.eventCount !== null;
  return (
    <LinkedListCard
      href={target}
      notificationCount={count}
      artworkLayout="cover"
      artwork={<GroupArtwork group={group} status="none" presentation="cover" />}
      leadingActions={local ? undefined : <GroupCardIndicators group={group} />}
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
      <ListCardBody
        title={group.name}
        titleIcon={<UsersRound className="size-4 shrink-0 text-muted" aria-hidden />}
        unread={Boolean(count)}
        titleAccessory={local ? <ClientRecordBadge phase={local.phase} /> : undefined}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
          <span className="inline-flex min-w-0 max-w-full items-start gap-1">
            <UsersRound className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              {i18n._({
                id: "group.card.members",
                message: "{count, plural, one {# Member} other {# Members}}",
                values: { count: group.memberCount },
              })}
            </span>
          </span>
          {events ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex min-w-0 max-w-full items-start gap-1">
                <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">
                  {i18n._({
                    id: "group.card.events",
                    message: "{count, plural, one {# Event} other {# Events}}",
                    values: { count: group.eventCount },
                  })}
                </span>
              </span>
            </>
          ) : null}
        </div>
      </ListCardBody>
    </LinkedListCard>
  );
}
