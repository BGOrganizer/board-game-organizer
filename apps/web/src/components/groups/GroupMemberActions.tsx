"use client";
import type { GroupPersonResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import { type GroupPersonAction, groupPersonActions } from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { Ban, ShieldMinus, ShieldPlus, UserRoundMinus } from "lucide-react";
import { MemberActions } from "@/components/common/ui/MemberActions";

export function GroupMemberActions({
  group,
  person,
  busy,
  onAction,
}: {
  group: GroupRecordResponse;
  person: GroupPersonResponse;
  busy: boolean;
  onAction: (action: GroupPersonAction) => void;
}) {
  const { t } = useLingui();
  const allowed = groupPersonActions(group, person);
  const items = [
    { action: "ban", label: t`Ban from group`, icon: <Ban className="size-5" aria-hidden /> },
    {
      action: "remove",
      label: t`Remove member`,
      icon: <UserRoundMinus className="size-5" aria-hidden />,
    },
    {
      action: "promote",
      label: t`Make moderator`,
      icon: <ShieldPlus className="size-5" aria-hidden />,
    },
    {
      action: "demote",
      label: t`Demote to member`,
      icon: <ShieldMinus className="size-5" aria-hidden />,
    },
  ] as const;
  return (
    <MemberActions
      title={`${t`Manage member`}: ${person.username || person.name || t`Username unavailable`}`}
      busy={busy}
      items={items.filter((item) => allowed.includes(item.action))}
      onAction={onAction}
    />
  );
}
