"use client";

import { type GroupRecordResponse, notificationItemId } from "@board-game-organizer/schemas";
import { UsersRound } from "lucide-react";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { GroupArtwork } from "./GroupArtwork";
import { GroupCardIndicators } from "./GroupCardIndicators";

export function GroupIdentityCard({ group }: { group: GroupRecordResponse }) {
  return (
    <RecordIdentityCard
      title={group.name}
      icon={<UsersRound className="mt-1 size-5 shrink-0 text-foreground" aria-hidden />}
      background={<GroupArtwork group={group} status="none" presentation="background" />}
      titleAccessory={
        <NotificationItem
          itemId={notificationItemId(group.id, "overview", undefined, "group")}
          readOnly
        />
      }
    >
      <GroupCardIndicators group={group} />
    </RecordIdentityCard>
  );
}
