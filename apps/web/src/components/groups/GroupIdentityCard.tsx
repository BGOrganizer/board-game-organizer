"use client";

import { type GroupRecordResponse, notificationItemId } from "@board-game-organizer/schemas";
import { groupPendingAction } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { CalendarDays, LockKeyhole, LockKeyholeOpen, UsersRound } from "lucide-react";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { ListCard } from "@/components/common/ui/ListCard";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { GroupArtwork } from "./GroupArtwork";
import { GroupStatusBadge } from "./GroupStatusBadge";

export function GroupIdentityCard({ group }: { group: GroupRecordResponse }) {
  const { t, i18n } = useLingui();
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
        label={t`Name`}
        helpTitle={t`Group name help`}
        help={t`Name, logo and group type. Group type cannot be changed.`}
      />
      <div className="flex flex-wrap items-start gap-2">
        <UsersRound className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
        <h1 className="min-w-0 flex-1 break-words text-lg font-semibold">{group.name}</h1>
        <NotificationItem
          itemId={notificationItemId(group.id, "overview", undefined, "group")}
          readOnly
        />
        <GroupStatusBadge group={group} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1">
          <Visibility className="size-4 text-muted" aria-hidden />
          {group.type === "PUBLIC" ? t`Public` : t`Private`}
        </span>
        <span className="inline-flex items-center gap-1">
          <UsersRound className="size-4 text-muted" aria-hidden />
          {numbers.format(group.memberCount)} {t`Confirmed members`}
        </span>
        {group.canViewEvents && group.eventCount !== null ? (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-4 text-muted" aria-hidden />
            {numbers.format(group.eventCount)} {t`Events`}
          </span>
        ) : null}
      </div>
      <ArtworkStatusPopover
        kind={kind}
        action={groupPendingAction(group)}
        label={
          group.role === "moderator"
            ? t`Group moderator`
            : kind === "admin"
              ? t`Group admin`
              : kind === "request"
                ? t`Membership requested`
                : undefined
        }
      />
    </ListCard>
  );
}
