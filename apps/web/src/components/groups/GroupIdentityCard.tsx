"use client";

import { type GroupRecordResponse, notificationItemId } from "@board-game-organizer/schemas";
import { UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { GroupArtwork } from "./GroupArtwork";
import { GroupCardIndicators } from "./GroupCardIndicators";

export function GroupIdentityCard({
  group,
  titleAction,
}: {
  group: GroupRecordResponse;
  titleAction?: ReactNode;
}) {
  return (
    <RecordIdentityCard
      titleAction={titleAction}
      title={group.name}
      icon={UsersRound}
      background={<GroupArtwork group={group} status="none" presentation="background" />}
      titleAccessory={
        titleAction ? undefined : (
          <NotificationItem itemId={notificationItemId(group.id, "overview", undefined, "group")} />
        )
      }
    >
      <GroupCardIndicators group={group} />
    </RecordIdentityCard>
  );
}
