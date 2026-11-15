"use client";

import {
  type PendingAction,
  RECORD_USER_ROLES,
  type RecordUserRole,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react/macro";
import { IdCard } from "lucide-react";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { recordUserRoleIcons } from "@/lib/recordUserRoleIcons";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";

/** One neutral identity control; an invitation remains a separate explicit decision in details. */
export function EventRolePopover({
  roles,
  action,
  pending = false,
}: {
  roles: readonly RecordUserRole[];
  action?: PendingAction | null;
  pending?: boolean;
}) {
  const { t, i18n } = useLingui();
  const colors = {
    warning: "text-warning-soft-foreground",
    accent: "text-accent-soft-foreground",
    success: "text-success-soft-foreground",
  };
  return (
    <HelpPopover
      label={t`Roles and participation`}
      title={t`Roles and participation`}
      icon={IdCard}
      tone="muted"
      size="compact"
      triggerClassName="bg-default"
    >
      <ul className="space-y-2">
        {roles.map((role) => {
          const item = RECORD_USER_ROLES[role],
            Icon = recordUserRoleIcons[item.icon];
          return (
            <li key={role} className="flex items-center gap-2">
              <Icon aria-hidden className={`size-4 shrink-0 ${colors[item.tone]}`} />
              <span>{i18n._(recordUserRoleMessages[role])}</span>
            </li>
          );
        })}
      </ul>
      {!roles.length ? <p>{pending ? t`Loading…` : t`You are not registered.`}</p> : null}
      {action ? (
        <p className="mt-2">{t`Open details to accept or decline your invitation.`}</p>
      ) : null}
    </HelpPopover>
  );
}
